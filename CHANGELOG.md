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
