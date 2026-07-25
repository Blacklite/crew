Feature: Hostile — Missing .crew/ configuration

  Scenario: Version works without .crew/ directory
    Given a directory without a ".crew" directory
    When I run "crew --version" in the temp directory
    Then the output matches pattern "\d+\.\d+\.\d+"
    And the exit code is 0

  Scenario: Help works without .crew/ directory
    Given a directory without a ".crew" directory
    When I run "crew --help" in the temp directory
    Then the output contains "Usage"
    And the exit code is 0

  Scenario: Status reports no crew without .crew/ directory
    Given a directory without a ".crew" directory
    When I run "crew status" in the temp directory
    Then the output contains "Crew Status"
    And the exit code is 0

  Scenario: Doctor runs without .crew/ directory
    Given a directory without a ".crew" directory
    When I run "crew doctor" in the temp directory
    Then the exit code is 0

  Scenario: Unknown command without .crew/ still errors cleanly
    Given a directory without a ".crew" directory
    When I run "crew garbage-cmd" in the temp directory
    Then the output contains "Unknown command"
    And the exit code is 1
