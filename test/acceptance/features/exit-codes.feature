Feature: Exit codes

  Scenario: Version command exits with code 0
    When I run "crew --version"
    Then the exit code is 0

  Scenario: Help command exits with code 0
    When I run "crew help"
    Then the exit code is 0

  Scenario: Unknown command exits with non-zero code
    When I run "crew nonexistent-cmd"
    Then the exit code is 1
