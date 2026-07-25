Feature: Error handling

  Scenario: Unknown command shows error
    When I run "crew nonexistent-command"
    Then the output contains "Unknown command"
    And the exit code is 1

  Scenario: Import without file shows error
    When I run "crew import"
    Then the output contains "crew import"
    And the exit code is 1
