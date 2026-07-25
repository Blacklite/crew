Feature: Status command

  Scenario: Show status in a repo with .crew directory
    Given the current directory has a ".crew" directory
    When I run "crew status"
    Then the output contains "Crew Status"
    And the output contains "Active crew:"
    And the exit code is 0
