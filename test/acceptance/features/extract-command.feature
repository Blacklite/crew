Feature: Extract command

  Scenario: Help text shows extract command
    When I run "crew help"
    Then the output contains "extract"
    And the output contains "Extract learnings from consult mode session"
    And the exit code is 0

  Scenario: Extract outside consult mode fails
    Given a directory without a ".crew" directory
    When I run "crew extract" in the temp directory
    Then the output contains "No .crew/config.json found"
    And the exit code is 1

  Scenario: Extract --dry-run option exists
    When I run "crew help"
    Then the output contains "extract"
    And the output contains "--dry-run"
    And the exit code is 0
