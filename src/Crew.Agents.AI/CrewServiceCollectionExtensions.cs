using Microsoft.Agents.AI;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace Crew.Agents.AI;

/// <summary>
/// Extension methods for registering <see cref="CrewAgent"/> in dependency injection.
/// </summary>
public static class CrewServiceCollectionExtensions
{
    internal const string DefaultConnectionStringName = "crew";

    /// <summary>
    /// Registers <see cref="CrewAgent"/> and base <see cref="AIAgent"/> with scoped lifetime.
    /// </summary>
    /// <param name="services">Service collection to update.</param>
    /// <param name="configure">Optional callback that customizes <see cref="CrewAgentOptions"/> after connection-string binding.</param>
    /// <returns>The same <paramref name="services"/> instance for chaining.</returns>
    /// <example>
    /// <code>
    /// builder.Services.AddCrewAgent(o => o.CrewFolderPath = @"C:\repo");
    /// </code>
    /// </example>
    public static IServiceCollection AddCrewAgent(
        this IServiceCollection services,
        Action<CrewAgentOptions>? configure = null)
        => AddCrewAgentCore(services, name: null, ServiceLifetime.Scoped, configure);

    /// <summary>
    /// Registers <see cref="CrewAgent"/> and base <see cref="AIAgent"/> with scoped lifetime using a named connection string.
    /// </summary>
    /// <param name="services">Service collection to update.</param>
    /// <param name="name">Logical Crew name. For example, <c>"research"</c> reads <c>ConnectionStrings:crew-research</c>.</param>
    /// <param name="configure">Optional callback that customizes <see cref="CrewAgentOptions"/> after connection-string binding.</param>
    /// <returns>The same <paramref name="services"/> instance for chaining.</returns>
    public static IServiceCollection AddCrewAgent(
        this IServiceCollection services,
        string name,
        Action<CrewAgentOptions>? configure = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        return AddCrewAgentCore(services, name, ServiceLifetime.Scoped, configure);
    }

    /// <summary>
    /// Registers <see cref="CrewAgent"/> and base <see cref="AIAgent"/> with the specified lifetime.
    /// </summary>
    /// <param name="services">Service collection to update.</param>
    /// <param name="lifetime">Lifetime used for the concrete and base agent registrations.</param>
    /// <param name="configure">Optional callback that customizes <see cref="CrewAgentOptions"/> after connection-string binding.</param>
    /// <returns>The same <paramref name="services"/> instance for chaining.</returns>
    public static IServiceCollection AddCrewAgent(
        this IServiceCollection services,
        ServiceLifetime lifetime,
        Action<CrewAgentOptions>? configure = null)
        => AddCrewAgentCore(services, name: null, lifetime, configure);

    /// <summary>
    /// Registers <see cref="CrewAgent"/> and base <see cref="AIAgent"/> with the specified lifetime using a named connection string.
    /// </summary>
    /// <param name="services">Service collection to update.</param>
    /// <param name="name">Logical Crew name. For example, <c>"research"</c> reads <c>ConnectionStrings:crew-research</c>.</param>
    /// <param name="lifetime">Lifetime used for the concrete and base agent registrations.</param>
    /// <param name="configure">Optional callback that customizes <see cref="CrewAgentOptions"/> after connection-string binding.</param>
    /// <returns>The same <paramref name="services"/> instance for chaining.</returns>
    public static IServiceCollection AddCrewAgent(
        this IServiceCollection services,
        string name,
        ServiceLifetime lifetime,
        Action<CrewAgentOptions>? configure = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        return AddCrewAgentCore(services, name, lifetime, configure);
    }

    // ── Keyed DI overloads ───────────────────────────────────────────────────

    /// <summary>
    /// Registers <see cref="CrewAgent"/> as a keyed service with scoped lifetime. Resolve via
    /// <c>[FromKeyedServices("myKey")] CrewAgent agent</c> or
    /// <c>provider.GetRequiredKeyedService&lt;CrewAgent&gt;("myKey")</c>.
    /// </summary>
    /// <param name="services">Service collection to update.</param>
    /// <param name="serviceKey">The DI service key for keyed resolution.</param>
    /// <param name="configure">Optional callback that customizes <see cref="CrewAgentOptions"/> after connection-string binding.</param>
    /// <returns>The same <paramref name="services"/> instance for chaining.</returns>
    /// <example>
    /// <code>
    /// builder.Services.AddKeyedCrewAgent("research", o => o.CrewFolderPath = @"C:\research-team");
    /// builder.Services.AddKeyedCrewAgent("platform", o => o.CrewFolderPath = @"C:\platform-team");
    ///
    /// // Resolve in a controller or minimal API:
    /// app.MapGet("/ask", ([FromKeyedServices("research")] CrewAgent agent) => ...);
    /// </code>
    /// </example>
    public static IServiceCollection AddKeyedCrewAgent(
        this IServiceCollection services,
        string serviceKey,
        Action<CrewAgentOptions>? configure = null)
        => AddKeyedCrewAgentCore(services, serviceKey, name: null, ServiceLifetime.Scoped, configure);

    /// <summary>
    /// Registers <see cref="CrewAgent"/> as a keyed service with scoped lifetime using a named connection string.
    /// </summary>
    /// <param name="services">Service collection to update.</param>
    /// <param name="serviceKey">The DI service key for keyed resolution.</param>
    /// <param name="name">Logical Crew name for connection-string lookup. For example, <c>"research"</c> reads <c>ConnectionStrings:crew-research</c>.</param>
    /// <param name="configure">Optional callback that customizes <see cref="CrewAgentOptions"/> after connection-string binding.</param>
    /// <returns>The same <paramref name="services"/> instance for chaining.</returns>
    public static IServiceCollection AddKeyedCrewAgent(
        this IServiceCollection services,
        string serviceKey,
        string name,
        Action<CrewAgentOptions>? configure = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        return AddKeyedCrewAgentCore(services, serviceKey, name, ServiceLifetime.Scoped, configure);
    }

    /// <summary>
    /// Registers <see cref="CrewAgent"/> as a keyed service with the specified lifetime.
    /// </summary>
    /// <param name="services">Service collection to update.</param>
    /// <param name="serviceKey">The DI service key for keyed resolution.</param>
    /// <param name="lifetime">Lifetime used for the keyed agent registration.</param>
    /// <param name="configure">Optional callback that customizes <see cref="CrewAgentOptions"/> after connection-string binding.</param>
    /// <returns>The same <paramref name="services"/> instance for chaining.</returns>
    public static IServiceCollection AddKeyedCrewAgent(
        this IServiceCollection services,
        string serviceKey,
        ServiceLifetime lifetime,
        Action<CrewAgentOptions>? configure = null)
        => AddKeyedCrewAgentCore(services, serviceKey, name: null, lifetime, configure);

    /// <summary>
    /// Registers <see cref="CrewAgent"/> as a keyed service with the specified lifetime using a named connection string.
    /// </summary>
    /// <param name="services">Service collection to update.</param>
    /// <param name="serviceKey">The DI service key for keyed resolution.</param>
    /// <param name="name">Logical Crew name for connection-string lookup.</param>
    /// <param name="lifetime">Lifetime used for the keyed agent registration.</param>
    /// <param name="configure">Optional callback that customizes <see cref="CrewAgentOptions"/> after connection-string binding.</param>
    /// <returns>The same <paramref name="services"/> instance for chaining.</returns>
    public static IServiceCollection AddKeyedCrewAgent(
        this IServiceCollection services,
        string serviceKey,
        string name,
        ServiceLifetime lifetime,
        Action<CrewAgentOptions>? configure = null)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        return AddKeyedCrewAgentCore(services, serviceKey, name, lifetime, configure);
    }

    // ── Core implementation (non-keyed) ──────────────────────────────────────

    private static IServiceCollection AddCrewAgentCore(
        IServiceCollection services,
        string? name,
        ServiceLifetime lifetime,
        Action<CrewAgentOptions>? configure)
    {
        ArgumentNullException.ThrowIfNull(services);

        var optionsName = GetOptionsName(name);
        var connectionStringNames = GetConnectionStringNames(name);

        RegisterOptionsInfrastructure(services, optionsName, connectionStringNames, configure);

        // Register CrewAgent with specified lifetime
        services.Add(new ServiceDescriptor(
            typeof(CrewAgent),
            sp =>
            {
                var options = sp.GetRequiredService<IOptionsMonitor<CrewAgentOptions>>().Get(optionsName);
                var loggerFactory = sp.GetService<ILoggerFactory>();
                var folderPath = options.CrewFolderPath;
                if (string.IsNullOrWhiteSpace(folderPath))
                    throw new InvalidOperationException(
                        "CrewAgentOptions.CrewFolderPath must be configured (via configure callback or connection string) before resolving CrewAgent.");
                return new CrewAgent(folderPath, options, loggerFactory);
            },
            lifetime));

        // AIAgent base registration — so consumers can resolve via IEnumerable<AIAgent>
        services.Add(new ServiceDescriptor(
            typeof(AIAgent),
            sp => sp.GetRequiredService<CrewAgent>(),
            lifetime));

        return services;
    }

    // ── Core implementation (keyed) ──────────────────────────────────────────

    private static IServiceCollection AddKeyedCrewAgentCore(
        IServiceCollection services,
        string serviceKey,
        string? name,
        ServiceLifetime lifetime,
        Action<CrewAgentOptions>? configure)
    {
        ArgumentNullException.ThrowIfNull(services);
        ArgumentException.ThrowIfNullOrWhiteSpace(serviceKey);

        // Use the serviceKey as the options name when no explicit name is given
        var optionsName = GetOptionsName(name ?? serviceKey);
        var connectionStringNames = GetConnectionStringNames(name ?? serviceKey);

        RegisterOptionsInfrastructure(services, optionsName, connectionStringNames, configure);

        // Register keyed CrewAgent
        services.Add(new ServiceDescriptor(
            typeof(CrewAgent),
            serviceKey,
            (sp, _) =>
            {
                var options = sp.GetRequiredService<IOptionsMonitor<CrewAgentOptions>>().Get(optionsName);
                var loggerFactory = sp.GetService<ILoggerFactory>();
                var folderPath = options.CrewFolderPath;
                if (string.IsNullOrWhiteSpace(folderPath))
                    throw new InvalidOperationException(
                        "CrewAgentOptions.CrewFolderPath must be configured (via configure callback or connection string) before resolving CrewAgent.");
                return new CrewAgent(folderPath, options, loggerFactory);
            },
            lifetime));

        // Keyed AIAgent — forwards to keyed CrewAgent
        services.Add(new ServiceDescriptor(
            typeof(AIAgent),
            serviceKey,
            (sp, _) => sp.GetRequiredKeyedService<CrewAgent>(serviceKey),
            lifetime));

        return services;
    }

    // ── Shared options registration ──────────────────────────────────────────

    private static void RegisterOptionsInfrastructure(
        IServiceCollection services,
        string optionsName,
        string[] connectionStringNames,
        Action<CrewAgentOptions>? configure)
    {
        // Register connection string configurator FIRST (runs before user callback)
        services.AddSingleton<IConfigureOptions<CrewAgentOptions>>(sp =>
            new CrewAgentOptionsConfigurator(
                sp.GetRequiredService<IConfiguration>(),
                optionsName,
                connectionStringNames));

        if (configure is not null)
        {
            services.Configure(optionsName, configure);
        }

        // TraceEvents=true → warn because verbose traces can contain sensitive details
        services.AddOptions<CrewAgentOptions>(optionsName)
            .PostConfigure<ILoggerFactory>((opts, loggerFactory) =>
            {
                if (opts.TraceEvents)
                {
                    var logger = loggerFactory.CreateLogger("Crew.Agents.AI.Startup");
                    logger.LogWarning(
                        "CrewAgentOptions.TraceEvents=true. Verbose tracing is enabled; " +
                        "not recommended for production use.");
                }
            });
    }

    private static string GetOptionsName(string? name)
    {
        return string.IsNullOrWhiteSpace(name) ? Options.DefaultName : name;
    }

    /// <summary>
    /// Returns the candidate IConfiguration ConnectionStrings: keys to try for a logical name.
    /// Tried in order; first non-empty value wins.
    /// </summary>
    /// <remarks>
    /// For a bare registration (<paramref name="name"/> null or whitespace) we look up the
    /// historical default key <c>crew</c>.
    /// <para>
    /// For a named registration we try the literal name first
    /// (e.g. <c>ConnectionStrings:research-crew</c> — the Aspire convention where the
    /// resource name IS the connection string key), then fall back to the legacy prefixed
    /// form (<c>ConnectionStrings:crew-research</c>) so existing consumers continue to work
    /// without changes.
    /// </para>
    /// </remarks>
    private static string[] GetConnectionStringNames(string? name)
    {
        if (string.IsNullOrWhiteSpace(name))
            return new[] { DefaultConnectionStringName };

        var prefixed = $"{DefaultConnectionStringName}-{name}";
        // Avoid duplicate lookups when the caller passes a name that's already prefixed
        // (e.g. AddCrewAgent("crew-research") → just look up "crew-research" once).
        return string.Equals(name, prefixed, StringComparison.Ordinal)
            ? new[] { name }
            : new[] { name, prefixed };
    }
}
