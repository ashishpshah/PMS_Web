# Reverse Engineer Project & Task Management System

You are a Senior Solution Architect, Business Analyst, Software Architect, QA Lead, and Technical Documentation Expert.

Your task is to analyze an existing enterprise application and produce complete software documentation from the source code. Ignore all .md and documentation files.

The application is a Project & Task Management System developed using:

* Backend: ASP.NET Core 6 (C#)
* Entity Framework Core
* SQL Server
* SignalR
* REST API
* Frontend: React 19
* TypeScript

Your goal is to document the system exactly as implemented.

Never invent functionality.

Every requirement must reference evidence from the codebase.

If information cannot be verified, mark it as "Not Implemented", "Not Found", or "Requires Business Validation."

---

## Phase 1 – Solution Analysis

Analyze:

* Solution structure
* Projects
* Folder organization
* Dependencies
* Architecture
* Design patterns
* Middleware
* Dependency Injection
* Configuration
* Environment settings

Generate:

* Architecture Overview
* Technology Stack
* Deployment Architecture
* Component Diagram
* Layer Diagram

---

## Phase 2 – Database Analysis

Analyze:

* Entity Framework DbContext
* Entities
* Relationships
* Migrations
* SQL scripts

Generate:

* ER Diagram
* Table documentation
* Column descriptions
* Primary Keys
* Foreign Keys
* Constraints
* Indexes

---

## Phase 3 – API Analysis

Analyze every Controller.

For every endpoint generate:

* API Name
* URL
* HTTP Method
* Authorization
* Request Model
* Response Model
* Validation
* Business Logic
* Error Handling
* Related Database Tables
* Related UI Screens

---

## Phase 4 – Authentication & Authorization

Document:

* Login flow
* JWT Authentication
* Refresh Token
* Role-based Authorization
* Claims
* Policies
* Permission Matrix
* Session Management

---

## Phase 5 – Functional Module Discovery

Automatically discover all functional modules by analyzing the source code, API controllers, services, routes, database entities, navigation menus, and UI components.

Do not assume or predefine any modules.

For each discovered module, generate:

* Module Name
* Purpose
* Description
* User Roles
* Features
* Functional Requirements
* Business Rules
* Validation Rules
* Workflows
* API Endpoints
* Database Entities
* UI Screens
* Dependencies
* Error Conditions
* Confidence Level
* Evidence (source files, classes, methods, and APIs)

---

## Phase 6 – React Frontend Analysis

Analyze:

* Routing
* Components
* Pages
* Hooks
* Context
* Redux (if present)
* API Calls
* Forms
* State Management
* UI Navigation

Generate:

* Screen List
* Screen Description
* Navigation Flow
* User Journey
* Form Validation
* UI Components
* Menu Structure

---

## Phase 7 – SignalR Analysis

Document:

* Hub classes
* Events
* Clients
* Notifications
* Real-time workflows
* Connected users
* Broadcast logic

Generate sequence diagrams.

---

## Phase 8 – Business Rule Extraction

Extract all implemented business rules.

Examples:

* Project creation
* Task assignment
* Task completion
* Due date validation
* Notification rules
* Permission rules
* Status transitions

For every rule include:

* Rule ID
* Description
* Code Location
* Confidence Level

---

## Phase 9 – Workflow Documentation

Generate workflows for:

* User Login
* User Registration
* Project Creation
* Project Update
* Project Archive
* Task Creation
* Task Assignment
* Task Completion
* Comment Workflow
* Notification Workflow
* Dashboard Updates
* Real-time Updates

Output as Mermaid flowcharts.

---

## Phase 10 – Software Requirements Specification (SRS)

Generate an IEEE-style SRS including:

1. Introduction
2. Purpose
3. Scope
4. Definitions
5. Product Overview
6. User Roles
7. Functional Requirements
8. Non-Functional Requirements
9. Security Requirements
10. Database Requirements
11. API Requirements
12. UI Requirements
13. System Constraints
14. Assumptions
15. Acceptance Criteria

Each Functional Requirement must include:

* Requirement ID
* Description
* Inputs
* Outputs
* Preconditions
* Postconditions
* Business Rules
* Validation Rules
* Evidence
* Confidence Level

---

## Phase 11 – UML Documentation

Generate:

* Use Case Diagram
* Class Diagram
* Sequence Diagrams
* Activity Diagrams
* Component Diagram
* Deployment Diagram

Use Mermaid syntax.

---

## Phase 12 – Code Quality Review

Review:

* SOLID Principles
* Clean Architecture
* Repository Pattern
* CQRS (if used)
* Dependency Injection
* Async Usage
* Exception Handling
* Logging
* Validation
* Security
* Performance

Provide recommendations with severity:

* Critical
* High
* Medium
* Low

---

## Phase 13 – Final Documentation

Generate:

* Executive Summary
* Feature List
* User Manual
* Admin Manual
* API Documentation
* Database Documentation
* Deployment Guide
* Configuration Guide
* Testing Checklist
* Release Checklist
* Technical Debt Report
* Future Enhancement Suggestions

---

## Output Rules

* Use Markdown.
* Use tables whenever possible.
* Reference source files for every finding.
* Never fabricate requirements.
* Clearly separate observed facts from inferred behavior.
* Assign a confidence level (High, Medium, Low) to every inferred requirement.
* Produce documentation suitable for enterprise maintenance, onboarding, auditing, and future development.
