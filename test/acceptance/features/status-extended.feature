Feature: Status command extended

  Scenario: Status shows resolution details
    Given the current directory has a ".crew" directory
    When I run "crew status"
    Then the output contains "Crew Status"
    And the output contains "Active crew:"
    And the output contains "Path:"
    And the exit code is 0

  Scenario: Status in directory without crew shows no active crew
    Given a directory without a ".crew" directory
    When I run "crew status" in the temp directory
    Then the output does not contain "Active crew:  repo"
    And the exit code is 0
