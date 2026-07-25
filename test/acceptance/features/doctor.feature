Feature: Doctor diagnostic

  Scenario: Run doctor in project with crew setup
    Given the current directory has a ".crew" directory
    When I run "crew doctor"
    Then the exit code is 0
