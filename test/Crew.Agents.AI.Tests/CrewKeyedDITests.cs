using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Xunit;

namespace Crew.Agents.AI.Tests;

/// <summary>
/// Validates keyed DI registration and resolution (Round 2 feature).
/// </summary>
public class CrewKeyedDITests
{
    [Fact]
    public void AddKeyedCrewAgent_ResolvesViaKeyedService()
    {
        var services = new ServiceCollection();
        var configuration = new ConfigurationBuilder().Build();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddLogging();
        services.AddKeyedCrewAgent("research", opts =>
        {
            opts.CrewFolderPath = @"C:\research-team";
            opts.CliPath = @"C:\fake\copilot.exe";
            opts.GitHubToken = "test-token";
        });

        var provider = services.BuildServiceProvider();
        var agent = provider.GetRequiredKeyedService<CrewAgent>("research");

        Assert.NotNull(agent);
        Assert.Equal("Crew", agent.Name);
    }

    [Fact]
    public void AddKeyedCrewAgent_TwoKeys_ResolveSeparately()
    {
        var services = new ServiceCollection();
        var configuration = new ConfigurationBuilder().Build();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddLogging();
        services.AddKeyedCrewAgent("research", opts =>
        {
            opts.AgentName = "Research Crew";
            opts.CrewFolderPath = @"C:\research";
            opts.CliPath = @"C:\fake\copilot.exe";
            opts.GitHubToken = "test-token";
        });
        services.AddKeyedCrewAgent("platform", opts =>
        {
            opts.AgentName = "Platform Crew";
            opts.CrewFolderPath = @"C:\platform";
            opts.CliPath = @"C:\fake\copilot.exe";
            opts.GitHubToken = "test-token";
        });

        var provider = services.BuildServiceProvider();
        var research = provider.GetRequiredKeyedService<CrewAgent>("research");
        var platform = provider.GetRequiredKeyedService<CrewAgent>("platform");

        Assert.Equal("Research Crew", research.Name);
        Assert.Equal("Platform Crew", platform.Name);
    }

    [Fact]
    public void AddKeyedCrewAgent_WithConnectionString_BindsOptions()
    {
        var services = new ServiceCollection();
        var configDict = new Dictionary<string, string?>
        {
            ["ConnectionStrings:crew-research"] = @"C:\conn-str-team"
        };
        var configuration = new ConfigurationBuilder()
            .AddInMemoryCollection(configDict)
            .Build();

        services.AddSingleton<IConfiguration>(configuration);
        services.AddLogging();
        services.AddKeyedCrewAgent("research", opts =>
        {
            opts.CliPath = @"C:\fake\copilot.exe";
            opts.GitHubToken = "test-token";
        });

        var provider = services.BuildServiceProvider();
        var agent = provider.GetRequiredKeyedService<CrewAgent>("research");

        Assert.NotNull(agent);
    }

    [Fact]
    public void AddKeyedCrewAgent_DoesNotRegisterNonKeyed()
    {
        var services = new ServiceCollection();
        var configuration = new ConfigurationBuilder().Build();
        services.AddSingleton<IConfiguration>(configuration);
        services.AddLogging();
        services.AddKeyedCrewAgent("research", opts =>
        {
            opts.CrewFolderPath = @"C:\research";
            opts.CliPath = @"C:\fake\copilot.exe";
            opts.GitHubToken = "test-token";
        });

        var provider = services.BuildServiceProvider();
        var nonKeyed = provider.GetService<CrewAgent>();

        // Keyed registration should NOT be resolvable via non-keyed
        Assert.Null(nonKeyed);
    }

    [Fact]
    public void AddKeyedCrewAgent_ThrowsOnNullOrWhitespaceKey()
    {
        var services = new ServiceCollection();

        Assert.Throws<ArgumentException>(() =>
            services.AddKeyedCrewAgent("", opts => { }));

        Assert.Throws<ArgumentException>(() =>
            services.AddKeyedCrewAgent("   ", opts => { }));
    }
}
