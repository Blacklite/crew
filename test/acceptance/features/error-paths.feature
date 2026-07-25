Feature: Error paths

  Scenario: Unknown command with special characters
    When I run "crew @invalid!cmd"
    Then the output contains "Unknown command"
    And the exit code is 1

  Scenario: Invalid flag is treated as unknown command
    When I run "crew --nonexistent-flag"
    Then the output contains "Unknown command"
    And the exit code is 1

  Scenario: Unknown command suggests help
    When I run "crew foobar"
    Then the output contains "crew help"
    And the exit code is 1
