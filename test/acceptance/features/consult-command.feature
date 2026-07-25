Feature: Consult command

  Scenario: Help text shows consult command
    When I run "crew help"
    Then the output contains "consult"
    And the output contains "Enter consult mode with your personal crew"
    And the exit code is 0

  Scenario: Consult in non-git directory fails
    Given a directory without a ".crew" directory
    When I run "crew consult" in the temp directory
    Then the output contains "Not a git repository"
    And the exit code is 1

  Scenario: Consult --status in non-consult directory
    Given a directory without a ".crew" directory
    When I run "crew consult --status" in the temp directory
    Then the output contains "Not in consult mode"
    And the exit code is 0

  Scenario: Consult blocked in crewified project
    Given the current directory has a ".crew" directory
    When I run "crew consult --check"
    Then the output contains "No personal crew found"
    And the exit code is 1

  Scenario: Extract requires consult mode
    Given a directory without a ".crew" directory
    When I run "crew extract" in the temp directory
    Then the output contains "No .crew/config.json found"
    And the exit code is 1
