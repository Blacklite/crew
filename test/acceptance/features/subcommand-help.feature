Feature: Subcommand --help intercept (#1201)

  Scenario: init --help prints help instead of scaffolding files
    Given a directory without a ".crew" directory
    When I run "crew init --help" in the temp directory
    Then the output contains "crew init"
    And the output contains "Usage:"
    And the exit code is 0
    And the temp directory has no ".crew" entry
    And the temp directory has no ".github" entry
    And the temp directory has no ".gitignore" entry

  Scenario: triage --help prints help instead of starting a polling loop
    When I run "crew triage --help"
    Then the output contains "crew triage"
    And the output contains "Usage:"
    And the exit code is 0

  Scenario: doctor --help prints help instead of running the doctor
    When I run "crew doctor --help"
    Then the output contains "crew doctor"
    And the output contains "Usage:"
    And the exit code is 0

  Scenario: status -h short flag prints help
    When I run "crew status -h"
    Then the output contains "crew status"
    And the output contains "Usage:"
    And the exit code is 0
