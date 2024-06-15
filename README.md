# Deliveroo Agent
<p align="center">
<img src="https://github.com/DavidC001/ASAP/assets/40665241/2ea27169-69c1-474d-95b5-ffb3368c09ea" style="display:block;float:none;margin-left:auto;margin-right:auto;width:50%"/>
</p>

## Authors

- Davide Cavicchini
- Laurence Bonat

## Project Overview

This project is part of the master course "Autonomous Software Agents" by Davide Cavicchini and Laurence Bonat. The primary goal of the project is to develop an autonomous agent using the Belief-Desire-Intention (BDI) architecture. The agent coordinates with another agent to play a game that involves picking up and delivering parcels.

## Repository Structure

```plaintext
ASAP/
├── beliefs/
│   ├── agents.js              # Manages beliefs about other agents in the environment
│   ├── beliefs.js             # General beliefs management
│   ├── map.js                 # Beliefs about the map layout
│   ├── parcels.js             # Beliefs about the parcels in the environment
|
├── coordination/
│   ├── CommunicationBuffer.js # Manages communication between agents
│   ├── coordination.js        # Handles coordination logic with other agents
|
├── planner/
│   ├── pddl-client/           # Client for interacting with PDDL planners
│   ├── PDDL_planners.js       # Interfaces for various PDDL planners
│   ├── planner.js             # Planning algorithms and logic
│   ├── recover.js             # Logic for recovering from failed plans
│   ├── search_planners.js     # Search algorithms for planning
|
├── visualizations/
│   ├── dashboard.html         # Visualization dashboard for the game state
│   ├── server.js              # Server for handling visualization updates
├── others/
│   ├── helper.js              # Helper functions used across the project
│   ├── log.js                 # Logging functionality
|
├── agent.js                   # Main agent logic
├── ASAP.pdf                   # Full project report
├── index.js                   # Entry point for running the agent
├── config.js                  # Configuration parameters
├── package.json               # Project metadata and dependencies
├── .gitignore                 # Files to be ignored by Git
└── README.md                  # Project documentation
```

## Getting Started

### Installation

1. **Clone the repository:**
   ```sh
   git clone https://github.com/DavidC001/ASAP.git
   cd ASAP
   ```

2. **Install dependencies:**
   ```sh
   npm install
   ```

3. **Set up Docker environment:**
   Follow the instructions in the [Planutils Server Environment](https://github.com/AI-Planning/planutils/tree/main/environments/server) to set up the Docker environment required for the PDDL planners.

4. **Configure environment variables:**
   Create an `.env` file with the following content:
   ```plaintext
   NAME = "AGENT_NAME"
   HOST="https://deliveroojs.onrender.com/?name=AGENT_NAME_1"
   TOKEN=""
   NODE_TLS_REJECT_UNAUTHORIZED = '0';

   USE_PDDL = "true";

   PAAS_HOST = "http://localhost:5555"

   PAAS_PATH = '/package/dual-bfws-ffparser/solve';
   ```

5. **Run the agent:**
   ```sh
   node --env-file=.env index.js
   ```

6. **Open the visualization dashboard:**
   Follow the link printed during the agent start-up i to view the game state as seen by the agent.

## Key Components

### Belief Revision

The belief revision process is responsible for updating the agent's knowledge about the environment. This includes information about the map, parcels, and other agents.

- **Beliefs Modules:**
  - `beliefs/beliefs.js`: General beliefs management, in charge of registering the beliefs listeners.
  - `beliefs/agents.js`: Manages beliefs about other agents in the environment.
  - `beliefs/parcels.js`: Beliefs about the parcels in the environment.
  - `beliefs/map.js`: Aggregates the beliefs in a single object, representing the entire known & predicted state of the environment.

### Intention Revision

Intention revision involves updating the agent's intentions based on the current beliefs and selecting the most appropriate intention to pursue.

- **Intention Class:** Encapsulates the agent's goal-oriented behaviors, including the planning and execution of intentions such as picking up parcels, delivering parcels, and exploring the environment.
- **Intentions Class:** Manages the list of all intentions and is responsible for selecting the most beneficial intention to execute based on the current state and the agent's utility function.

### Planning

The planning process involves generating a sequence of actions to achieve the agent's goals. This is done using various planning algorithms, including PDDL planners.

- **Planner Modules:**
  - `planner/planner.js`: Planning algorithms and logic.
  - `planner/PDDL_planners.js`: Defines the PDDL problems and domains to send to the PDDL planners, and parses the planner output.
  - `planner/search_planners.js`: Uses BFS search to find a plan for the agent.
  - `planner/recover.js`: Logic for recovering from failed plans.
