Feature: Hostile — Corrupt configuration files

  Scenario: .crew/ directory exists but is empty
    Given a temp directory with an empty ".crew" directory
    When I run "crew status" in the temp directory
    Then the process does not crash
    And the exit code is not null

  Scenario: .crew/team.md is an empty file
    Given a temp directory with an empty ".crew/team.md"
    When I run "crew status" in the temp directory
    Then the process does not crash
    And the exit code is not null

  Scenario: .crew/team.md contains invalid content
    Given a temp directory with ".crew/team.md" containing "{{{{INVALID JSON NOT MARKDOWN}}}}"
    When I run "crew status" in the temp directory
    Then the process does not crash
    And the exit code is not null

  Scenario: .crew/ is a file instead of directory
    Given a temp directory where ".crew" is a regular file
    When I run "crew status" in the temp directory
    Then the process does not crash
    And the exit code is not null

  Scenario: Doctor handles corrupt .crew/ gracefully
    Given a temp directory with an empty ".crew" directory
    When I run "crew doctor" in the temp directory
    Then the process does not crash
    And the exit code is not null
