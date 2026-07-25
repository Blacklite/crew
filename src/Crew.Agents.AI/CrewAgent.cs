using GitHub.Copilot;
using Microsoft.Agents.AI;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Crew.Agents.AI;

/// <summary>
/// Microsoft Agent Framework agent that delegates to a GitHub Copilot SDK client configured for a Crew team root.
/// Extends <see cref="DelegatingAIAgent"/> — Core* pass-through overrides are provided by the base class.
/// </summary>
/// <remarks>
/// <para>
/// Use <see cref="CrewServiceCollectionExtensions.AddCrewAgent(Microsoft.Extensions.DependencyInjection.IServiceCollection, Action{CrewAgentOptions}?)"/>
/// for DI registration in applications. Direct construction is useful for tests or simple console hosts.
/// </para>
/// <example>
/// <code>
/// var agent = new CrewAgent(@"C:\repo");
/// var response = await agent.RunAsync("Summarize the team.");
/// </code>
/// </example>
/// </remarks>
public sealed class CrewAgent : DelegatingAIAgent, IAsyncDisposable
{
    private readonly CopilotClient _copilotClient;
    private readonly ILogger? _logger;
    private readonly bool _ownsClient;
    private readonly CrewAgentOptions _options;
    private readonly CrewSubagentTraceMapper? _traceMapper;

    // State-bag to thread pre-base-ctor state through chain constructors.
    // DelegatingAIAgent requires the inner AIAgent at base() call time, so we
    // build everything via static factory methods before invoking base().
    private readonly record struct CrewAgentState(
        AIAgent Inner,
        CopilotClient CopilotClient,
        ILogger? Logger,
        bool OwnsClient,
        CrewAgentOptions Options,
        CrewSubagentTraceMapper? TraceMapper);

    /// <summary>
    /// Initializes a new <see cref="CrewAgent"/> with the Crew team root as the primary required parameter.
    /// </summary>
    /// <param name="crewFolderPath">Path to the initialized Crew team root. Required.</param>
    /// <param name="options">
    /// Optional options. When <see langword="null"/> a default <see cref="CrewAgentOptions"/> is used.
    /// <see cref="CrewAgentOptions.CrewFolderPath"/> is overwritten by <paramref name="crewFolderPath"/>
    /// so there is exactly one source of truth for the team root.
    /// </param>
    /// <param name="loggerFactory">Optional logger factory; inject via DI or supply directly.</param>
    public CrewAgent(string crewFolderPath, CrewAgentOptions? options = null, ILoggerFactory? loggerFactory = null)
        : this(BuildState(crewFolderPath, options, loggerFactory))
    {
    }

    /// <summary>
    /// Initializes a new <see cref="CrewAgent"/> from the options pattern (DI-friendly).
    /// </summary>
    /// <param name="options">
    /// Options wrapper. <see cref="CrewAgentOptions.CrewFolderPath"/> must be set via a configure callback
    /// or connection string before the agent is resolved from DI.
    /// </param>
    /// <param name="loggerFactory">Optional logger factory.</param>
    /// <exception cref="ArgumentException">
    /// Thrown when <see cref="CrewAgentOptions.CrewFolderPath"/> is <see langword="null"/> or whitespace.
    /// </exception>
    public CrewAgent(IOptions<CrewAgentOptions> options, ILoggerFactory? loggerFactory = null)
        : this(BuildStateFromOptions(options, loggerFactory))
    {
    }

    private CrewAgent(CrewAgentState state)
        : base(state.Inner)
    {
        _copilotClient = state.CopilotClient;
        _logger = state.Logger;
        _ownsClient = state.OwnsClient;
        _options = state.Options;
        _traceMapper = state.TraceMapper;
        _logger?.LogInformation("CrewAgent initialized with name '{AgentName}', team root '{TeamRoot}'",
            state.Options.AgentName, state.Options.CrewFolderPath);
    }

    private static CrewAgentState BuildState(string crewFolderPath, CrewAgentOptions? options, ILoggerFactory? lf)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(crewFolderPath);
        var resolved = options ?? new CrewAgentOptions();
        resolved.CrewFolderPath = crewFolderPath; // ctor param wins
        return BuildStateInternal(resolved, lf);
    }

    private static CrewAgentState BuildStateFromOptions(IOptions<CrewAgentOptions> options, ILoggerFactory? lf)
    {
        ArgumentNullException.ThrowIfNull(options);
        var opts = options.Value ?? throw new ArgumentException("Options.Value cannot be null.", nameof(options));
        if (string.IsNullOrWhiteSpace(opts.CrewFolderPath))
            throw new ArgumentException(
                "CrewAgentOptions.CrewFolderPath must be set (via configure callback or connection string).",
                nameof(options));
        return BuildStateInternal(opts, lf);
    }

    private static CrewAgentState BuildStateInternal(CrewAgentOptions options, ILoggerFactory? lf)
    {
        var client = CreateCopilotClient(options, lf);

        // Build the SessionConfig. Two non-obvious settings are critical here for the
        // CrewAgent to actually work end-to-end against a `.crew/`-initialised team:
        //
        //   1. ConfigDir + EnableConfigDiscovery = true
        //      Points the Copilot CLI at the .crew/ folder so it auto-discovers the
        //      team's agents, skills, instructions, and MCP servers at session start.
        //      Without these, the agent has to read .crew/team.md (and per-agent
        //      charters) via runtime file tools — every read becomes a permission
        //      request, the agent eventually gives up and reports "permission errors".
        //
        //   2. OnPermissionRequest = PermissionHandler.ApproveAll
        //      Required by the SDK (CreateSessionAsync throws without it). This is the
        //      SDK-protocol layer; the CLI also has its own per-tool gate which we
        //      open with --allow-all in CreateCopilotClient.
        //
        // Callers can override any of this via CrewAgentOptions.ConfigureSession.
        var teamRoot = options.Cwd ?? options.CrewFolderPath;
        var crewConfigDir = !string.IsNullOrEmpty(teamRoot)
            ? Path.Combine(teamRoot, ".crew")
            : null;

        var sessionConfig = new SessionConfig
        {
            OnPermissionRequest = PermissionHandler.ApproveAll,
            WorkingDirectory = teamRoot,
            ConfigDirectory = crewConfigDir,
            EnableConfigDiscovery = true,
            Agent = "Crew"
        };
        if (!string.IsNullOrEmpty(options.Instructions))
        {
            sessionConfig.SystemMessage = new SystemMessageConfig { Content = options.Instructions };
        }

        // Install the subagent trace mapper when EITHER:
        //   - EmitSubagentActivities is on (default true) — to emit OTel spans + events
        //   - OnSubagentTrace is set — to forward typed events to the consumer
        // The two concerns are independent; the mapper handles whichever combination is active.
        CrewSubagentTraceMapper? traceMapper = null;
        if (options.EmitSubagentActivities || options.OnSubagentTrace is not null)
        {
            traceMapper = new CrewSubagentTraceMapper(
                options.OnSubagentTrace,
                emitActivities: options.EmitSubagentActivities);
            sessionConfig.IncludeSubAgentStreamingEvents = true;
            sessionConfig.OnEvent = traceMapper.OnSessionEvent;
            
        }

        options.ConfigureSession?.Invoke(sessionConfig);

        var inner = client.AsAIAgent(
            sessionConfig: sessionConfig,
            ownsClient: true,
            id: null,
            name: options.AgentName ?? "Crew",
            description: null);

        return new CrewAgentState(inner, client, lf?.CreateLogger<CrewAgent>(), true, options, traceMapper);
    }

    // ── Extensibility seam ──────────────────────────────────────────────
    // CreateCopilotClient is the single factory method that translates
    // CrewAgentOptions into a live CopilotClient. Three extension points
    // feed into it:
    //   1. GitHubTokenProvider / GitHubToken — credential override.
    //   2. ConfigureCopilotClient — BYOK delegate for advanced SDK tuning.
    //   3. Connection-string binding (handled before this method by the
    //      CrewAgentOptionsConfigurator).
    // Any future credential-store or model-property hooks should integrate
    // through CrewAgentOptions and be applied inside this method.
    // ────────────────────────────────────────────────────────────────────
    private static CopilotClient CreateCopilotClient(CrewAgentOptions options, ILoggerFactory? loggerFactory)
    {
        var logger = loggerFactory?.CreateLogger<CrewAgent>();

        // Resolve token: provider takes precedence over direct property
        string? resolvedToken = null;
        if (options.GitHubTokenProvider is not null)
        {
            // Call provider synchronously (constructor context requires sync)
            resolvedToken = options.GitHubTokenProvider(CancellationToken.None).GetAwaiter().GetResult();
        }
        else
        {
            resolvedToken = options.GitHubToken;
        }

        // ── CLI path resolution ────────────────────────────────────────────
        // When this package is consumed via NuGet, GitHub.Copilot.SDK's build
        // targets download the copilot CLI binary and copy it to bin/.../runtimes/
        // {rid}/native/copilot.exe. The SDK runtime looks there by default, so
        // most consumers don't need to set anything.
        //
        // (Crew.Agents.AI keeps a *direct* PackageReference to GitHub.Copilot.SDK
        // exactly to force those build targets to fire — without it the SDK is only
        // a transitive dependency of Microsoft.Agents.AI.GitHub.Copilot and its
        // build/ targets don't propagate. Once microsoft/agent-framework#6457
        // merges, this dance will no longer be required.)
        //
        // CrewAgentOptions.CliPath / CliArgs remain explicit overrides for advanced
        // scenarios: custom CLI builds, sandboxed runners, air-gapped environments.
        // SDK 1.0.0 expresses both via RuntimeConnection.ForStdio(path, args), so we
        // build a single Connection when either is supplied.
        // ───────────────────────────────────────────────────────────────────
        var clientOptions = new CopilotClientOptions
        {
            WorkingDirectory = options.Cwd ?? options.CrewFolderPath,
            GitHubToken = resolvedToken,
        };

        // ── CLI permission flags ───────────────────────────────────────────
        // The Copilot CLI enforces THREE independent permission gates:
        //   1. Tools   (--allow-all-tools)  — which tool kinds may run
        //   2. Paths   (--allow-all-paths)  — which filesystem paths may be read/written
        //   3. URLs    (--allow-all-urls)   — which URLs may be fetched
        //
        // The SDK-level `OnPermissionRequest` handler only covers the SDK protocol;
        // each CLI gate is a separate verification step. We pass `--allow-all` by
        // default so the CrewAgent can actually drive tool calls end-to-end against
        // the entire Crew workspace. Hosts that want stricter behavior can replace
        // this via CrewAgentOptions.CliArgs / the ConfigureCopilotClient delegate.
        // ───────────────────────────────────────────────────────────────────
        // Skip our `--allow-all` default if the host already opted in via any of the
        // CLI's permission-opening flags (or the omnibus `--yolo` alias). Comparison is
        // case-insensitive because `copilot --help` documents the flags in lowercase but
        // CLI argument parsers on Windows are commonly forgiving of case differences.
        var combinedCliArgs = new List<string>();
        bool hostAlreadyOpenedPermissions = options.CliArgs.Any(a =>
            string.Equals(a, "--allow-all", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(a, "--allow-all-tools", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(a, "--allow-all-paths", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(a, "--allow-all-urls", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(a, "--yolo", StringComparison.OrdinalIgnoreCase));
        if (!hostAlreadyOpenedPermissions)
        {
            combinedCliArgs.Add("--allow-all");
        }

        // ── Default coordinator agent selection ────────────────────────────
        // CrewAgent wraps a Crew coordinator team. The CLI's `--agent crew`
        // flag is what teaches the coordinator to eager-execute, fan out, and
        // dispatch via the task tool by loading `.github/agents/crew.agent.md`
        // as the agent definition. Without it the CLI uses its built-in generic
        // agent and the coordinator role-plays responses inline instead of
        // spawning real subagents — producing SDK behaviour that does NOT match
        // running `copilot --agent crew` interactively against the same team
        // root.
        //
        // Note on SessionConfig.Agent: that SDK property exists but selects
        // from the SDK's CustomAgents registry, NOT from `.github/agents/*.agent.md`
        // files (verified at v1.0.0 — setting it without populating CustomAgents
        // produces `Custom agent 'crew' not found`). The CLI `--agent` flag is
        // currently the only path that reads the on-disk agent definition.
        //
        // We auto-add `--agent {AgentFileName}` (default "crew") unless:
        //   1. The host already supplied --agent explicitly in CliArgs
        //   2. AgentFileName is null or whitespace (explicit opt-out)
        //   3. The agent file does not exist at the conventional path on disk
        //      (graceful degradation for folders that are not yet Crew-initialized,
        //      where the CLI would error on `--agent crew`)
        // ───────────────────────────────────────────────────────────────────
        bool hostSuppliedAgent = options.CliArgs.Any(a =>
            string.Equals(a, "--agent", StringComparison.OrdinalIgnoreCase));
        if (!hostSuppliedAgent && !string.IsNullOrWhiteSpace(options.AgentFileName))
        {
            var defaultAgentTeamRoot = options.Cwd ?? options.CrewFolderPath;
            if (!string.IsNullOrWhiteSpace(defaultAgentTeamRoot))
            {
                var agentFilePath = Path.Combine(defaultAgentTeamRoot, ".github", "agents", $"{options.AgentFileName}.agent.md");
                if (File.Exists(agentFilePath))
                {
                    combinedCliArgs.Add("--agent");
                    combinedCliArgs.Add(options.AgentFileName);
                }
                else
                {
                    logger?.LogDebug(
                        "CrewAgentOptions.AgentFileName is '{AgentFileName}' but the file was not found at '{AgentFilePath}'. Skipping --agent argument; the CLI will fall back to its default agent.",
                        options.AgentFileName, agentFilePath);
                }
            }
        }

        combinedCliArgs.AddRange(options.CliArgs);

        // Only override the SDK's default child-process connection when the consumer
        // supplied a custom CLI path or any extra CLI args. Otherwise let the SDK
        // resolve its own bundled binary (downloaded via the build/ targets).
        if (!string.IsNullOrEmpty(options.CliPath) || combinedCliArgs.Count > 0)
        {
            clientOptions.Connection = RuntimeConnection.ForStdio(options.CliPath, combinedCliArgs);
        }

        // Copy environment variables.
        //
        // ⚠️ Important: the dictionary assigned to clientOptions.Environment is what the
        // native CLI process inherits — there is no implicit merge with the parent process
        // env. If we only forwarded the consumer's overrides, the child would be missing
        // SYSTEMROOT/PATH/TEMP and Node's crypto initialization would crash
        // ("Assertion failed: ncrypto::CSPRNG(nullptr, 0)" on Windows).
        //
        // So we always start from the current process environment and layer the consumer's
        // overrides on top. A consumer that genuinely wants a sanitized env can still do so
        // via the ConfigureCopilotClient delegate (and is responsible for keeping the
        // crypto-critical vars in that case).
        if (options.Environment.Count > 0)
        {
            var envDict = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (System.Collections.DictionaryEntry entry in Environment.GetEnvironmentVariables())
            {
                if (entry.Key is string k && entry.Value is string v)
                {
                    envDict[k] = v;
                }
            }
            foreach (var kvp in options.Environment)
            {
                if (kvp.Value != null)
                    envDict[kvp.Key] = kvp.Value;
            }
            clientOptions.Environment = envDict;
        }

        // Set logger if trace events enabled
        if (options.TraceEvents && loggerFactory != null)
        {
            clientOptions.Logger = loggerFactory.CreateLogger<CopilotClient>();
        }

        // ── BYOK / ConfigureCopilotClient delegate ─────────────────────
        // Allow consumers to customize the CopilotClientOptions after Crew
        // applies its standard values. After the delegate runs, snapshot and
        // restore routing-critical properties to prevent accidental or
        // malicious changes that would route the agent to a different CLI
        // process. (Picard Condition 1: hard routing gate.)
        //
        // SDK 1.0.0 collapsed CliPath/CliArgs into Connection (RuntimeConnection),
        // so the routing gate now snapshots WorkingDirectory and Connection.
        if (options.ConfigureCopilotClient is not null)
        {
            var snapshotWorkingDirectory = clientOptions.WorkingDirectory;
            var snapshotConnection = clientOptions.Connection;

            options.ConfigureCopilotClient(clientOptions);

            bool restored = false;
            if (!string.Equals(clientOptions.WorkingDirectory, snapshotWorkingDirectory, StringComparison.Ordinal))
            {
                logger?.LogWarning(
                    "ConfigureCopilotClient delegate changed WorkingDirectory from '{Original}' to '{Changed}'; " +
                    "restoring original value to preserve Crew routing.",
                    snapshotWorkingDirectory, clientOptions.WorkingDirectory);
                clientOptions.WorkingDirectory = snapshotWorkingDirectory;
                restored = true;
            }

            if (!ReferenceEquals(clientOptions.Connection, snapshotConnection))
            {
                logger?.LogWarning(
                    "ConfigureCopilotClient delegate replaced Connection; " +
                    "restoring original value to preserve Crew routing. " +
                    "Configure CLI path / args via CrewAgentOptions.CliPath / CliArgs instead.");
                clientOptions.Connection = snapshotConnection;
                restored = true;
            }

            if (restored)
            {
                logger?.LogWarning(
                    "One or more routing properties were restored after ConfigureCopilotClient delegate ran. " +
                    "To set the team root, CLI path, or CLI args, configure them on CrewAgentOptions instead.");
            }
        }

        return new CopilotClient(clientOptions);
    }

    /// <summary>
    /// Gets the display name exposed by this agent.
    /// Prefers <see cref="CrewAgentOptions.AgentName"/> over the inner agent's name.
    /// </summary>
    public override string? Name => _options.AgentName ?? base.Name;

    /// <summary>
    /// Gets the agent description, falling back to a Crew-specific default when the inner agent provides none.
    /// </summary>
    public override string? Description => base.Description ?? "Crew multi-agent CLI participant";

    /// <summary>
    /// Disposes the owned Copilot client and disposable inner agent resources.
    /// </summary>
    /// <returns>A value task that completes when disposal finishes.</returns>
    public async ValueTask DisposeAsync()
    {
        if (_ownsClient)
            await _copilotClient.DisposeAsync().ConfigureAwait(false);

        if (InnerAgent is IAsyncDisposable innerDisposable)
            await innerDisposable.DisposeAsync().ConfigureAwait(false);

        // Drain any subagent activities that never received a matching SubagentCompletedEvent
        // (e.g. session ended mid-dispatch). Failing to do so leaks Activity instances.
        _traceMapper?.Dispose();

        _logger?.LogDebug("CrewAgent disposed");
    }
}
