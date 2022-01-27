# 1.0.0-beta.30 (01/26/2022)

- Bugfix: Fix logging on response streams. (#96) (@willstott101)

# 1.0.0-beta.21 (01/24/2022)

- Avoid using self in service.ts - to avoid issue with through (#95) (@willstott101)

# 1.0.0-beta.1 (01/02/2022)

- Migrates to typescript (@5GameMaker @gabrielcsapo)
- Removes node support from node@<14

# 0.6.1 (03/03/2019)

- Fixes bug with being able to overwrite git repos that a user doesn't have access to. @masasron

# 0.6.0 (03/03/2019)

- Augments the authenticate function declaration to accept an object as the first argument and a callback for the second. This allows us to make changes without having to cause breaking changes.
  - Adds the ability to introspect on the header (fixes #49)

# 0.5.1 (03/03/2019)

- bump dependencies
  - tap `^11.0.1` -> `^12.5.3`
  - tryitout `^2.0.6` -> `^2.1.1`

# 0.5.0 (11/27/2018)

- adds `log` functionality for event streams and response streams

# 0.4.3 (04/30/2018)

- removes deprecated `Buffer` interface

# 0.4.2 (12/07/2017)

- adds https support

# 0.4.1 (12/04/2017)

- fixes type to be the same as the event names

# 0.4.0 (12/03/2017)

- [BREAKING] changes the interface for authentication to make it more flexible
- when error is sent back to client ensure error is string

# 0.3.4 (11/10/2017)

- updates duplex lib to fix cork, uncork and add some chaining
- adds extensive docs to Git, Util and Service
- adds named function to events to trace errors more easily

# 0.3.3 (11/05/2017)

- Removes dependency on http-duplex package replacing w/ internal replacement lib
- updates tryitout@1.0.0 and updates Docs

# 0.3.2 (11/02/2017)

- fixes pathing issues on non linux/unix based operating systems (windows)

# 0.3.1 (10/17/2017)

- allow authenticate to handle promises

# 0.3.0

- removes authentication logic and makes it a configurable middleware
- passes username to listener objects

# 0.2.1 (09/15/2017)

- fixes bug that would let anyone publish to a repo regardless of permissions that were set
- fixes bug in test that didn't properly test auth based operations

# 0.2.0 (09/05/2017)

- abstracts server into lib/git.js
- fixes list to only return valid .git directories
- adds tests for basicAuth middleware
- isolate helper functions into util.js
- refactor unit tests to subside in files they are relevant to
- adds jsdoc

# 0.1.0 (05/08/2017)

- adds basic authentication protection for repositories
- updates docs to expose information

# 0.0.3 (05/08/2017)

- fixes bug with `mkdir` function that caused random directories to be created
