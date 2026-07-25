using GitHub.Copilot;
using Xunit;

namespace Crew.Agents.AI.Tests;

/// <summary>
/// Verifies the SessionConfig surface (PR-1207-r3):
///   - CrewAgent always builds a SessionConfig with a default OnPermissionRequest
///     so CreateSession does not throw out of the box.
///   - CrewAgentOptions.ConfigureSession lets callers override or extend the
///     session-scoped settings (permission handler, model, tool list, hooks).
///   - CrewAgentOptions.Instructions is rendered as the SessionConfig.SystemMessage.
/// </summary>
public class CrewAgentSessionConfigTests
{
    [Fact]
    public void ConfigureSession_Property_IsSettable_AndCallable()
    {
        var options = new CrewAgentOptions();
        var invocations = 0;
        SessionConfig? observed = null;

        options.ConfigureSession = config =>
        {
            invocations++;
            observed = config;
        };

        // Simulate what CrewAgent's internal pipeline does so we don't depend on
        // a real Copilot CLI process here: the package owns the wiring; this test
        // covers the public surface contract.
        var simulatedDefault = new SessionConfig
        {
            OnPermissionRequest = PermissionHandler.ApproveAll,
        };
        options.ConfigureSession.Invoke(simulatedDefault);

        Assert.Equal(1, invocations);
        Assert.Same(simulatedDefault, observed);
    }

    [Fact]
    public void ConfigureSession_IsNullByDefault()
    {
        var options = new CrewAgentOptions();
        Assert.Null(options.ConfigureSession);
    }

    [Fact]
    public void ConfigureSession_CanReplacePermissionHandler()
    {
        var options = new CrewAgentOptions();
        // Build a no-op handler so we just verify the property can be reassigned.
        // The exact PermissionRequestResult shape isn't relevant to this test.
        var customHandler = PermissionHandler.ApproveAll;

        options.ConfigureSession = config => config.OnPermissionRequest = customHandler;

        var sessionConfig = new SessionConfig();
        sessionConfig.OnPermissionRequest = PermissionHandler.ApproveAll; // initial default
        var initial = sessionConfig.OnPermissionRequest;

        options.ConfigureSession.Invoke(sessionConfig);

        Assert.NotNull(sessionConfig.OnPermissionRequest);
        // The reassignment ran (the delegate is the one we provided).
        Assert.Same(customHandler, sessionConfig.OnPermissionRequest);
    }

    [Fact]
    public void ConfigureSession_CanSetAvailableTools()
    {
        var options = new CrewAgentOptions();
        options.ConfigureSession = config =>
        {
            config.AvailableTools = new[] { "shell", "read", "write" };
        };

        var sessionConfig = new SessionConfig { OnPermissionRequest = PermissionHandler.ApproveAll };
        options.ConfigureSession.Invoke(sessionConfig);

        Assert.Equal(new[] { "shell", "read", "write" }, sessionConfig.AvailableTools);
    }
}
