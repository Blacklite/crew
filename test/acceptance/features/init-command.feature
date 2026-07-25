Feature: Init command

  Scenario: Init in existing project shows ready message
    Given the current directory has a ".crew" directory
    When I run "crew init"
    Then the output contains "Crew initialized"
    And the output contains "already exists"
    And the exit code is 0

  Scenario: Init exit code is zero on success
    When I run "crew init"
    Then the exit code is 0
