using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;

namespace Crew.Agents.AI;

/// <summary>
/// Binds CrewAgentOptions from a configured connection string.
/// Runs before user-supplied configure lambda; user settings always win.
/// </summary>
/// <remarks>
/// <para>
/// Resolves the connection string by trying each candidate name in order and using the first
/// one that returns a non-empty value. This lets a single registration accept both the
/// Aspire-style direct name (e.g. <c>ConnectionStrings:research-crew</c>) and the legacy
/// prefixed name (<c>ConnectionStrings:crew-research</c>) without breaking either convention.
/// </para>
/// </remarks>
internal sealed class CrewAgentOptionsConfigurator : IConfigureNamedOptions<CrewAgentOptions>
{
    private readonly IConfiguration _configuration;
    private readonly string _optionsName;
    private readonly string[] _connectionStringNames;

    public CrewAgentOptionsConfigurator(IConfiguration configuration)
        : this(configuration, Options.DefaultName, new[] { CrewServiceCollectionExtensions.DefaultConnectionStringName })
    {
    }

    internal CrewAgentOptionsConfigurator(
        IConfiguration configuration,
        string optionsName,
        string connectionStringName)
        : this(
            configuration,
            optionsName,
            new[] { connectionStringName ?? throw new ArgumentNullException(nameof(connectionStringName)) })
    {
    }

    internal CrewAgentOptionsConfigurator(
        IConfiguration configuration,
        string optionsName,
        string[] connectionStringNames)
    {
        _configuration = configuration ?? throw new ArgumentNullException(nameof(configuration));
        _optionsName = optionsName ?? Options.DefaultName;
        _connectionStringNames = connectionStringNames ?? throw new ArgumentNullException(nameof(connectionStringNames));
        if (_connectionStringNames.Length == 0)
            throw new ArgumentException("At least one connection string name must be supplied.", nameof(connectionStringNames));
    }

    public void Configure(CrewAgentOptions options) => Configure(Options.DefaultName, options);

    public void Configure(string? name, CrewAgentOptions options)
    {
        if (!string.Equals(name ?? Options.DefaultName, _optionsName, StringComparison.Ordinal))
            return;

        // Try each candidate name in order; first non-empty wins. This lets a single
        // AddCrewAgent("research") call resolve either ConnectionStrings:research
        // (Aspire-style) or ConnectionStrings:crew-research (legacy SDK convention).
        string? connectionString = null;
        foreach (var candidate in _connectionStringNames)
        {
            var value = _configuration.GetConnectionString(candidate);
            if (!string.IsNullOrWhiteSpace(value))
            {
                connectionString = value;
                break;
            }
        }

        if (string.IsNullOrWhiteSpace(connectionString))
            return;

        var parsedOptions = CrewConnectionFactory.FromConnectionString(connectionString);

        // Only apply parsed values if user hasn't set them explicitly
        // User callback runs AFTER this configurator, so any null/empty here will be overridden
        if (string.IsNullOrWhiteSpace(options.CrewFolderPath))
            options.CrewFolderPath = parsedOptions.CrewFolderPath;

        if (string.IsNullOrWhiteSpace(options.CliPath))
            options.CliPath = parsedOptions.CliPath;

        if (string.IsNullOrWhiteSpace(options.Cwd))
            options.Cwd = parsedOptions.Cwd;

        // Merge CLI args (append to existing list)
        foreach (var arg in parsedOptions.CliArgs)
        {
            if (!options.CliArgs.Contains(arg))
                options.CliArgs.Add(arg);
        }

        // Merge environment variables (don't overwrite existing)
        foreach (var kvp in parsedOptions.Environment)
        {
            if (!options.Environment.ContainsKey(kvp.Key))
                options.Environment[kvp.Key] = kvp.Value;
        }
    }
}
