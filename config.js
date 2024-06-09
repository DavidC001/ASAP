const config = {

    host: process.env.HOST,
    token: process.env.TOKEN

}

const DASHBOARD = true; // if true, the dashboard will be available at http://localhost:PORT

// Agent intention revision and execution hyperparameters
const MAX_RETRIES = 2; // Number of retries before trying to recover the plan
const USE_PDDL = (process.env.USE_PDDL) ? process.env.USE_PDDL === "true" : false; // If true, the agent will use PDDL to plan its actions
const CHANGE_INTENTION_INTERVAL = 1; // Number of moves before checking if the intention should be changed
const HARD_REPLAN_MOVE_INTERVAL = (USE_PDDL) ? Math.Infinity : 6; // Number of moves before hard replanning
const SOFT_REPLAN_INTERVAL = (USE_PDDL) ? 6 : Math.Infinity; // Number of moves before soft replanning
const INTENTION_REVISION_INTERVAL = 100; // Interval between intention revision
const BASE_PLANNING_TIME = (USE_PDDL) ? 400 : 0; // Time taken by the planner to plan the actions
const PLANNING_TIME_DECAY = 0.8; // Decay rate for the planning time
const STOP_WHILE_PLANNING_INTERVAL = 100; // Interval used to check if another intention wins before planning finishes
const PENALITY_RATE_CARRIED_PARCELS = 1.25; // Rate of penalty for each carried parcel
const BASE_MOVE_SLACK = 100; // Slack time to consider in the movement duration
const SLACK_DECAY = 0.8; // Decay rate for the slack time

// Planner hyperparameters
const MAX_WAIT = (USE_PDDL)? 1:10; // Maximum number of moves to wait on a tile
const MAX_EXPLORE_PATH_LENGTH = 20; // Maximum length of the path to explore
const PROBABILITY_KEEP_BEST_TILE = 0.8; // Probability to keep the tile when ther is a tie in the exploration
const TIME_PENALTY = 10; // When I'm unable to reach the exploration goal, penalize the tile so to eventually discard it
// Recover plan hyperparameters
const MAX_WAIT_FAIL = 5; // Maximum number of moves to wait on a tile when the plan fails to see the other agent intention
const BASE_FAIL_WAIT = 1000; // Base time to wait when the plan fails to see the other agent intention

// Coordination hyperparameters
const NAME = process.env.NAME || "FerrariMasterPlan"; // Name of the collaborative agent
const MAX_REQUEST_TIME = 2000; // Maximum time to wait for a response from the other agent
const MAX_AWAIT_RETRY = 20; // Maximum number of retries to wait for a request from the other agent
const MAX_MSG = 200; // Maximum number of messages to keep in the buffer

// Belief revision hyperparameters
const MAX_HISTORY = 5; // Maximum number of history to keep for each agent
const MAX_FUTURE = (USE_PDDL)? 1:20; // Maximum number of future to calculate
const MAX_SPAWNABLE_TILES_DISTANCE = 1; // Maximum distance to consider a tile spawnable in the same region
const MAX_AGENT_HEATMAP_DISTANCE = 3; // distance an agent affets the heatmap
const MAX_TIME = 500; // Maximum time for last_seen for the tiles
const DELETE_UNSEEN_AGENTS_INTERVAL = 2500; // Interval to delete the agents that are not seen anymore
const LAST_SEEN_RESCALE_FACTOR = 0.5; // Factor to rescale the last seen time

export {
    config, DASHBOARD,

    MAX_RETRIES, HARD_REPLAN_MOVE_INTERVAL, SOFT_REPLAN_INTERVAL, USE_PDDL, 
    INTENTION_REVISION_INTERVAL, BASE_PLANNING_TIME, PLANNING_TIME_DECAY,
    STOP_WHILE_PLANNING_INTERVAL, PENALITY_RATE_CARRIED_PARCELS,
    BASE_MOVE_SLACK, SLACK_DECAY, CHANGE_INTENTION_INTERVAL,

    MAX_WAIT, MAX_EXPLORE_PATH_LENGTH, PROBABILITY_KEEP_BEST_TILE, 
    TIME_PENALTY, MAX_WAIT_FAIL, BASE_FAIL_WAIT,

    NAME, MAX_REQUEST_TIME, MAX_AWAIT_RETRY, MAX_MSG,

    MAX_HISTORY, MAX_FUTURE, MAX_SPAWNABLE_TILES_DISTANCE, 
    MAX_AGENT_HEATMAP_DISTANCE, MAX_TIME, DELETE_UNSEEN_AGENTS_INTERVAL,
    LAST_SEEN_RESCALE_FACTOR
};
