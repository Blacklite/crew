Feature: Hostile — Non-TTY pipe mode

  Scenario: Version works when piped (non-TTY)
    Given a non-TTY environment
    When I run "crew --version" in non-TTY mode
    Then the output matches pattern "\d+\.\d+\.\d+"
    And the exit code is 0

  Scenario: Help works when piped (non-TTY)
    Given a non-TTY environment
    When I run "crew --help" in non-TTY mode
    Then the output contains "Usage"
    And the exit code is 0

  Scenario: Status works when piped (non-TTY)
    Given a non-TTY environment
    When I run "crew status" in non-TTY mode
    Then the output contains "Crew Status"
    And the exit code is 0

  Scenario: Error output is clean when piped
    Given a non-TTY environment
    When I run "crew nonexistent" in non-TTY mode
    Then the output contains "Unknown command"
    And the exit code is 1
