#====================================================================================================
# START - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================

# THIS SECTION CONTAINS CRITICAL TESTING INSTRUCTIONS FOR BOTH AGENTS
# BOTH MAIN_AGENT AND TESTING_AGENT MUST PRESERVE THIS ENTIRE BLOCK

# Communication Protocol:
# If the `testing_agent` is available, main agent should delegate all testing tasks to it.
#
# You have access to a file called `test_result.md`. This file contains the complete testing state
# and history, and is the primary means of communication between main and the testing agent.
#
# Main and testing agents must follow this exact format to maintain testing data. 
# The testing data must be entered in yaml format Below is the data structure:
# 
## user_problem_statement: {problem_statement}
## backend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.py"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## frontend:
##   - task: "Task name"
##     implemented: true
##     working: true  # or false or "NA"
##     file: "file_path.js"
##     stuck_count: 0
##     priority: "high"  # or "medium" or "low"
##     needs_retesting: false
##     status_history:
##         -working: true  # or false or "NA"
##         -agent: "main"  # or "testing" or "user"
##         -comment: "Detailed comment about status"
##
## metadata:
##   created_by: "main_agent"
##   version: "1.0"
##   test_sequence: 0
##   run_ui: false
##
## test_plan:
##   current_focus:
##     - "Task name 1"
##     - "Task name 2"
##   stuck_tasks:
##     - "Task name with persistent issues"
##   test_all: false
##   test_priority: "high_first"  # or "sequential" or "stuck_first"
##
## agent_communication:
##     -agent: "main"  # or "testing" or "user"
##     -message: "Communication message between agents"

# Protocol Guidelines for Main agent
#
# 1. Update Test Result File Before Testing:
#    - Main agent must always update the `test_result.md` file before calling the testing agent
#    - Add implementation details to the status_history
#    - Set `needs_retesting` to true for tasks that need testing
#    - Update the `test_plan` section to guide testing priorities
#    - Add a message to `agent_communication` explaining what you've done
#
# 2. Incorporate User Feedback:
#    - When a user provides feedback that something is or isn't working, add this information to the relevant task's status_history
#    - Update the working status based on user feedback
#    - If a user reports an issue with a task that was marked as working, increment the stuck_count
#    - Whenever user reports issue in the app, if we have testing agent and task_result.md file so find the appropriate task for that and append in status_history of that task to contain the user concern and problem as well 
#
# 3. Track Stuck Tasks:
#    - Monitor which tasks have high stuck_count values or where you are fixing same issue again and again, analyze that when you read task_result.md
#    - For persistent issues, use websearch tool to find solutions
#    - Pay special attention to tasks in the stuck_tasks list
#    - When you fix an issue with a stuck task, don't reset the stuck_count until the testing agent confirms it's working
#
# 4. Provide Context to Testing Agent:
#    - When calling the testing agent, provide clear instructions about:
#      - Which tasks need testing (reference the test_plan)
#      - Any authentication details or configuration needed
#      - Specific test scenarios to focus on
#      - Any known issues or edge cases to verify
#
# 5. Call the testing agent with specific instructions referring to test_result.md
#
# IMPORTANT: Main agent must ALWAYS update test_result.md BEFORE calling the testing agent, as it relies on this file to understand what to test next.

#====================================================================================================
# END - Testing Protocol - DO NOT EDIT OR REMOVE THIS SECTION
#====================================================================================================



#====================================================================================================
# Testing Data - Main Agent and testing sub agent both should log testing data below this section
#====================================================================================================

user_problem_statement: "Investigate backend test failures from Analytics implementation without changing Analytics functionality; run the normal suite against an isolated test environment."
backend:
  - task: "Implement GA4 Data API reporting for Admin Analytics"
    implemented: true
    working: "NA"
    file: "backend/routers/analytics_routes.py"
    stuck_count: 0
    priority: "high"
    needs_retesting: true
    status_history:
      - working: true
        agent: "main"
        comment: "Read-only GA4 runReport queries and dashboard metrics are implemented; 9 Analytics tests pass. Live API verification could not run because GOOGLE_APPLICATION_CREDENTIALS is absent from this runtime and google-auth is not installed locally; pip install was blocked by the package index/network."
  - task: "Classify full backend test failures and check Analytics regression"
    implemented: true
    working: true
    file: "backend/tests"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: "NA"
        agent: "main"
        comment: "Prior run reported 21 failures and 24 errors, with integration tests unable to connect to localhost:8000. Will rerun using local MongoDB and a fresh isolated DB_NAME, with the FastAPI server started on localhost:8000."
      - working: true
        agent: "main"
        comment: "With localhost API and MongoDB on a fresh isolated DB, full serial suite completed 79 passed, 7 failed, 5 errors. Analytics tests passed. Remaining failures/errors are pre-existing suite/config mismatches: catalog featured-priority vs sort assertions; Cashfree disabled vs legacy mock-order tests; one missing fixture argument; expected prior paid order; pytest-asyncio not installed; dynamic-category TestClient tests fail only after preceding modules close the shared Motor event loop (isolated module passes 6/6). No Analytics-caused regression found."
frontend:
  - task: "Display GA4 Data API report metrics in the Admin Analytics dashboard"
    implemented: true
    working: true
    file: "frontend/src/pages/admin/AdminAnalytics.jsx"
    stuck_count: 0
    priority: "high"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Added a separate GA4 property metrics panel; first-party and paid-order data remain separate. Frontend suite passes 31 tests and production build succeeds with existing lint warnings."
  - task: "Report frontend and build status for Analytics integration"
    implemented: true
    working: true
    file: "frontend/src/lib/analytics.js"
    stuck_count: 0
    priority: "medium"
    needs_retesting: false
    status_history:
      - working: true
        agent: "main"
        comment: "Prior verification: 30 frontend tests passed and production build succeeded with existing hook dependency warnings."
metadata:
  created_by: "main"
  version: "1.0"
  test_sequence: 2
  run_ui: false
test_plan:
  current_focus:
    - "Provide GOOGLE_APPLICATION_CREDENTIALS to the local backend runtime and install declared google-auth dependency to make a real API request"
    - "Verify successful API response is displayed in the Admin Analytics GA4 panel"
  stuck_tasks: []
  test_all: true
  test_priority: "sequential"
agent_communication:
  - agent: "main"
    message: "GA4 Data API integration is implemented and mocked tests pass. The configured credential variable isn't visible in the local runtime, so a live report call is still unverified; credential contents were not accessed or printed."
  - agent: "main"
    message: "No separate testing agent is available. Running the test suite directly against a fresh local test database; production jave_house DB and remote MongoDB URLs are excluded."
