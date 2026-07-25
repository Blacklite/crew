using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using Xunit;

namespace Crew.Agents.AI.Tests;

public class CrewServiceCollectionExtensionsTests
{
    [Fact]
    public void AddCrewAgent_WithoutConfig_ThrowsOnResolution()
    {
        var services = new ServiceCollection();
        var configuration = new ConfigurationBuilder().Build();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddLogging();
        services.AddCrewAgent();

        var provider = services.BuildServiceProvider();

        // CrewFolderPath not set → InvalidOperationException on resolution (MAF ctor pattern).
        Assert.Throws<InvalidOperationException>(() => provider.GetRequiredService<CrewAgent>());
    }

    [Fact]
    public void AddCrewAgent_WithConnectionString_BindsCrewFolderPath()
    {
        var services = new ServiceCollection();
        var configDict = new Dictionary<string, string?>
        {
            ["ConnectionStrings:crew"] = @"C:\team-root"
        };
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(configDict)
            .Build();

        services.AddSingleton<IConfiguration>(configuration);
        services.AddLogging();
        services.AddCrewAgent();

        var provider = services.BuildServiceProvider();
        var options = provider.GetRequiredService<IOptions<CrewAgentOptions>>().Value;

        Assert.Equal(@"C:\team-root", options.CrewFolderPath);
        Assert.Equal(@"C:\team-root", options.Cwd);
    }

    [Fact]
    public void AddCrewAgent_WithName_BindsNamedConnectionString()
    {
        var services = new ServiceCollection();
        var configDict = new Dictionary<string, string?>
        {
            ["ConnectionStrings:crew"] = @"C:\default-team-root",
            ["ConnectionStrings:crew-research"] = @"C:\research-team-root"
        };
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(configDict)
            .Build();

        services.AddSingleton<IConfiguration>(configuration);
        services.AddLogging();
        services.AddCrewAgent("research");

        var provider = services.BuildServiceProvider();
        var options = provider.GetRequiredService<IOptionsMonitor<CrewAgentOptions>>().Get("research");

        Assert.Equal(@"C:\research-team-root", options.CrewFolderPath);
        Assert.Equal(@"C:\research-team-root", options.Cwd);
    }

    [Fact]
    public void AddCrewAgent_WithName_UserCallbackOverridesNamedConnectionString()
    {
        var services = new ServiceCollection();
        var configDict = new Dictionary<string, string?>
        {
            ["ConnectionStrings:crew-research"] = @"C:\research-team-root"
        };
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(configDict)
            .Build();

        services.AddSingleton<IConfiguration>(configuration);
        services.AddLogging();
        services.AddCrewAgent("research", opts =>
        {
            opts.CrewFolderPath = @"C:\override-team-root";
        });

        var provider = services.BuildServiceProvider();
        var options = provider.GetRequiredService<IOptionsMonitor<CrewAgentOptions>>().Get("research");

        Assert.Equal(@"C:\override-team-root", options.CrewFolderPath);
    }

    [Fact]
    public void AddCrewAgent_UserCallbackOverridesConnectionString()
    {
        var services = new ServiceCollection();
        var configDict = new Dictionary<string, string?>
        {
            ["ConnectionStrings:crew"] = @"C:\team-root"
        };
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(configDict)
            .Build();

        services.AddSingleton<IConfiguration>(configuration);
        services.AddLogging();
        services.AddCrewAgent(opts =>
        {
            opts.CrewFolderPath = @"C:\user-override";
        });

        var provider = services.BuildServiceProvider();
        var options = provider.GetRequiredService<IOptions<CrewAgentOptions>>().Value;

        Assert.Equal(@"C:\user-override", options.CrewFolderPath);
    }

    [Fact]
    public void AddCrewAgent_WithUriConnectionString_ParsesAllFields()
    {
        var services = new ServiceCollection();
        var configDict = new Dictionary<string, string?>
        {
            ["ConnectionStrings:crew"] = "crew://localhost?teamRoot=C:%5Cteam&cliPath=C:%5Cbin%5Ccopilot.exe"
        };
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(configDict)
            .Build();

        services.AddSingleton<IConfiguration>(configuration);
        services.AddLogging();
        services.AddCrewAgent();

        var provider = services.BuildServiceProvider();
        var options = provider.GetRequiredService<IOptions<CrewAgentOptions>>().Value;

        Assert.Equal(@"C:\team", options.CrewFolderPath);
        Assert.Equal(@"C:\bin\copilot.exe", options.CliPath);
    }

    [Fact]
    public void AddCrewAgent_WithNoConnectionString_DoesNotThrow()
    {
        var services = new ServiceCollection();
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(new Dictionary<string, string?>())
            .Build();

        services.AddSingleton<IConfiguration>(configuration);
        services.AddLogging();
        services.AddCrewAgent();

        var provider = services.BuildServiceProvider();
        var options = provider.GetRequiredService<IOptions<CrewAgentOptions>>().Value;

        // Should get default CrewAgentOptions
        Assert.Null(options.CrewFolderPath);
    }

    [Fact]
    public void AddCrewAgent_MergesCliArgsFromConnectionString()
    {
        var services = new ServiceCollection();
        var configDict = new Dictionary<string, string?>
        {
            ["ConnectionStrings:crew"] = "crew://localhost?teamRoot=/team&cliArgs=--verbose"
        };
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(configDict)
            .Build();

        services.AddSingleton<IConfiguration>(configuration);
        services.AddLogging();
        services.AddCrewAgent(opts =>
        {
            opts.CliArgs.Add("--user-arg");
        });

        var provider = services.BuildServiceProvider();
        var options = provider.GetRequiredService<IOptions<CrewAgentOptions>>().Value;

        Assert.Contains("--verbose", options.CliArgs);
        Assert.Contains("--user-arg", options.CliArgs);
    }
}
