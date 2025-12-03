// Paris Ward, Lucas Moraes, Joshua Ethington, Parker Sandstrom
// This code will allow users of a non profit to manage visitor information, user information, events, milestones, and donations

// REQUIRE LIBRARIES AND STORE IN VARIABLE (if applicable):
require("dotenv").config(); // DOTENV: loads ENVIROMENT VARIABLES from .env file; Allows you to use process.env
const express = require("express"); // EXPRESS: helps with web development
const session = require("express-session"); // EXPRESS SESSION: needed for session variable. Stored on the server to hold data; Essentially adds a new property to every req object that allows you to store a value per session.
let path = require("path"); // PATH: helps create safe paths when working with file/folder locations
let bodyParser = require("body-parser"); // BODY-PARSER: Allows you to read the body of incoming HTTP requests and makes that data available on req.body
<<<<<<< HEAD
const knex = require("knex")({ // KNEX: allows you to work with SQL databases
    client: "pg", // connect to PostgreSQL (put database name here if something else)
    connection: { // connect to the database. If you deploy this to an internet host, you need to use process.env.DATABASE_URL
        host: process.env.RDS_HOSTNAME || "localhost",
        user: process.env.RDS_USERNAME || "postgres",
        password: process.env.RDS_PASSWORD || "admin",
        database: process.env.RDS_DB_NAME || "EllaRises",
        port: process.env.RDS_PORT || 5432,
    }});
=======
const knex = require("knex")({
  // KNEX: allows you to work with SQL databases
  client: "pg", // connect to PostgreSQL (put database name here if something else)
  connection: {
    // connect to the database. If you deploy this to an internet host, you need to use process.env.DATABASE_URL
    host: process.env.RDS_HOSTNAME || "localhost",
    user: process.env.RDS_USERNAME || "postgres",
    password: process.env.RDS_PASSWORD || "admin",
    database: process.env.RDS_DB_NAME || "ella_rising",
    port: process.env.RDS_PORT || 5432,
  },
});

// Add this debugging code to test database connection:
knex
  .raw("SELECT current_database()")
  .then((result) => {
    console.log("Database connection successful!");
    console.log("Connected to database:", result.rows[0].current_database);
  })
  .catch((err) => {
    console.error("Database connection error:", err.message);
    console.error("Full error:", err);
  });

function paramToArray(val, defaultVal = ["all"]) {
  if (!val) return defaultVal;
  return Array.isArray(val) ? val : [val];
}

// For surveys: map logical column names (from UI) to real DB columns (with table aliases)
const SURVEY_COLUMN_MAP = {
  participant_first_name: "p.participant_first_name",
  participant_last_name: "p.participant_last_name",
  event_name: "e.event_name",
  event_date: "e.event_date",
  survey_satisfaction_score: "s.survey_satisfaction_score",
  survey_usefulness_score: "s.survey_usefulness_score",
  survey_instructor_score: "s.survey_instructor_score",
  survey_recommendation_score: "s.survey_recommendation_score",
  survey_overall_score: "s.survey_overall_score",
  survey_nps_bucket: "s.survey_nps_bucket",
  survey_submission_date: "s.survey_submission_date",
};

const SURVEY_SEARCHABLE_COLUMNS = [
  "participant_first_name",
  "participant_last_name",
  "event_name",
  "event_date",
  "survey_nps_bucket",
];
>>>>>>> a8eabed5cdb7c43a00eef8a8d409bb3f00769db2

// CREATE VARIABLES:
    let app = express(); // creates an express object called app
    const port = process.env.PORT || 3000; // Creates variable to store port. Uses .env variable "PORT". You can also just leave that out if aren't using .env

// PATHS:
    app.set("view engine", "ejs"); // Allows you to use EJS for the web pages - requires a views folder and all files are .ejs
    app.use("/images", express.static(path.join(__dirname, "images"))); // allows you to create path for images (in folder titled "images")
    app.use(express.static("public"));
    app.use(
        session({
        secret: process.env.SESSION_SECRET || "intex-secret-key",
        resave: false,
        saveUninitialized: false,
        }));

// OTHER SETUP:
    // Ensures a value is returned as an array, using a default if value is empty.
    function paramToArray(val, defaultVal = ["all"]) {
        if (!val) return defaultVal;
        return Array.isArray(val) ? val : [val];
    };

// MIDDLEWARE:
    app.use(express.urlencoded({ extended: true })); // Makes working with HTML forms a lot easier. Takes inputs and stores them in req.body (for post) or req.query (for get).

// HOME PAGE:
    app.get("/", (req, res) => {
        res.render("index");
    });

// ABOUT PAGE:
    app.get("/about", (req, res) => {
        res.render("about");
    });

// DONATE NOW PAGE:
    app.get("/donate_now", (req, res) => {
        res.render("donate_now");
    });

// LOGIN PAGE:
<<<<<<< HEAD
    // Route to display Login Page
    app.get("/login", (req, res) => { 
        res.render("login");
=======
app.get("/login", (req, res) => {
  res.render("login");
});

app.post("/login", (req, res) => {
  let username = req.body.username;
  let password = req.body.password;

  knex
    .select()
    .from("users")
    .where({ username: username, password: password })
    .first()
    .then((user) => {
      if (user) {
        req.session.user = {
          id: user.id,
          username: user.username,
          level: user.level,
        };
        res.redirect("/user_profile");
      } else {
        console.log("Invalid credentials for:", username); // Add this
        res.render("login", { error_message: "Invalid credentials" });
      }
    })
    .catch((err) => {
      console.error("❌ Database error during login:", err.message); // Improve this
      console.error("Full error:", err); // Add this
      res.render("login", { error_message: "Database error" });
>>>>>>> a8eabed5cdb7c43a00eef8a8d409bb3f00769db2
    });

    // Route to log user in
    app.post("/login", (req, res) => {
        let username = req.body.username;
        let password = req.body.password;

        knex
        .select()
        .from("users")
        .where({ username: username, password: password })
        .first()
        .then((user) => {
            if (user) {
            req.session.user = {
                id: user.id,
                username: user.username,
                level: user.level,
            };
            res.redirect("/user_profile");
            } else {
            res.render("login", { error_message: "Invalid credentials" });
            }
        }).catch((err) => {
            console.error(err);
            res.render("login", { error_message: "Login error" });
        });
    });

    // ADD ENTRY PAGE:
    app.get('/add/:table', async (req, res) => {
    const table_name = req.params.table;
    let events = [];

    if (table_name === "survey_results") {
        events = await knex("events")
            .select("event_id", "event_name", "event_date", "event_start_time", "event_end_time")
            .orderBy(["event_name", "event_date", "event_start_time"]);
    }

    res.render("add", { table_name, events });
    });

    // ADD SURVEY (INSERT INTO survey_results)
    app.post("/add/survey", async (req, res) => {
    // NOTE: This is still a simple placeholder; update later to match your add.ejs form and real columns
    const { event_name, event_id /* plus any other survey fields */ } = req.body;

    try {
        await knex("survey_results").insert({
            event_name: event_name, // adjust to real column names when wiring form
            event_id: event_id
            // other survey columns here...
        });

    res.redirect("/surveys");
    } catch (err) {
    console.error("Error inserting survey:", err);
    res.status(500).send("Error saving survey");
    }
    });

    // DELETE FUNCTIONALITY:
    // Map tables to primary key columns
    const deleteConfig = {
    participants: "participant_id",
    events: "event_id",
    surveys: "survey_id",
    milestones: "milestone_id",
    donations: "donation_id",
    users: "user_id",
    };

    app.post("/delete-multiple", async (req, res) => {
    try {
    const { table, ids, message } = req.body;

    const idColumn = deleteConfig[table];
    if (!idColumn) {
        console.error("Delete attempted on invalid table:", table);
        return res.status(400).send("Invalid table");
    }

    let idArray = [];
    if (typeof ids === "string") {
        idArray = JSON.parse(ids);
    } else if (Array.isArray(ids)) {
        idArray = ids;
    }

    if (!Array.isArray(idArray) || idArray.length === 0) {
        return res.redirect("/" + table);
    }

    const deletedCount = await knex(table).whereIn(idColumn, idArray).del();

    // store flash message in session
    // if the page sent a custom message, use it; otherwise use a fallback
    req.session.flashMessage = message || `${deletedCount} record(s) deleted`;
    req.session.flashType = "success";

    res.redirect("/" + table);
    } catch (err) {
    console.error("Error deleting records:", err);
    req.session.flashMessage = "Error deleting record(s)";
    req.session.flashType = "danger";
    res.redirect("/" + (req.body.table || ""));
    }
    });
<<<<<<< HEAD

    // USER MAINTENANCE PAGE:
    app.get("/users", (req, res) => {
    res.render("users");
=======
  } catch (err) {
    console.error("❌ Error loading participants:", err);
    console.error("Error details:", {
      message: err.message,
      code: err.code,
      detail: err.detail,
    });
    res.render("participants", {
      participant: [],
      message: "Error loading participants",
      messageType: "danger",
      filters: {
        searchColumn: "participant_first_name",
        searchValue: "",
        city: ["all"],
        school: ["all"],
        interest: ["all"],
        donations: ["all"],
        sortColumn: "",
        sortOrder: "asc",
      },
>>>>>>> a8eabed5cdb7c43a00eef8a8d409bb3f00769db2
    });

    // PARTICIPANT MAINTENANCE PAGE:
    app.get("/participants", async (req, res) => {
        try {
        // safe access to session
        const sessionData = req.session || {};
    
        const message = sessionData.flashMessage || "";
        const messageType = sessionData.flashType || "success";
    
        // clear flash so it only shows once
        sessionData.flashMessage = null;
        sessionData.flashType = null;
    
        // --- filtering/sorting code ---
        let {
            searchColumn,
            searchValue,
            city,
            school,
            interest,
            donations,
            sortColumn,
            sortOrder,
        } = req.query;
    
        // defaults
        searchColumn = searchColumn || "participant_first_name";
        sortOrder = sortOrder === "desc" ? "desc" : "asc";
    
        let query = knex("participants");
    
        // Case-insensitive search (handles "Full Name")
        if (searchValue && searchColumn) {
            const term = searchValue.trim();
            if (term) {
            if (searchColumn === "full_name") {
                // Split "Jane Doe Smith" into parts
                const parts = term.split(/\s+/);
    
                if (parts.length === 1) {
                // One word: search first OR last name
                const likeOne = `%${parts[0]}%`;
                query.where(function () {
                    this.where("participant_first_name", "ilike", likeOne)
                    .orWhere("participant_last_name", "ilike", likeOne);
                });
                } else {
                // Multiple words: use first piece as first name, last piece as last name
                const firstLike = `%${parts[0]}%`;
                const lastLike = `%${parts[parts.length - 1]}%`;
    
                query.where(function () {
                    this.where("participant_first_name", "ilike", firstLike)
                    .andWhere("participant_last_name", "ilike", lastLike);
                });
                }
            } else {
                // Existing behavior for single column (non full_name searches)
                const likeTerm = `%${term}%`;
                query.whereRaw(
                `CAST(${searchColumn} AS TEXT) ILIKE ?`,
                [likeTerm]
                );
            }
            }
        }
    
        // City filter
        const cityArr = paramToArray(city);
        if (!cityArr.includes("all")) {
            query.whereIn("participant_city", cityArr);
        }
    
        // School filter
        const schoolArr = paramToArray(school);
        if (!schoolArr.includes("all")) {
            query.whereIn("participant_school_or_employer", schoolArr);
        }
    
        // Interest filter
        const interestArr = paramToArray(interest);
        if (!interestArr.includes("all")) {
            query.whereIn("participant_field_of_interest", interestArr);
        }
    
        // Donations filter
        const donationsArr = paramToArray(donations);
        if (!donationsArr.includes("all")) {
            if (donationsArr.includes("Yes") && !donationsArr.includes("No")) {
            query.where("total_donations", ">", 0);
            } else if (
            donationsArr.includes("No") &&
            !donationsArr.includes("Yes")
            ) {
            query.where((qb) => {
                qb.where("total_donations", 0).orWhereNull("total_donations");
            });
            }
        }
    
        // Sorting
        if (sortColumn) {
            query.orderBy(sortColumn, sortOrder);
        }
    
        const results = await query;
    
        const filters = {
            searchColumn,
            searchValue: searchValue || "",
            city: cityArr,
            school: schoolArr,
            interest: interestArr,
            donations: donationsArr,
            sortColumn: sortColumn || "",
            sortOrder,
        };
    
        res.render("participants", {
            participant: results,
            message,
            messageType,
            filters,
        });
        } catch (err) {
        console.error("Error loading participants:", err);
        res.render("participants", {
            participant: [],
            message: "Error loading participants",
            messageType: "danger",
            filters: {
            searchColumn: "participant_first_name",
            searchValue: "",
            city: ["all"],
            school: ["all"],
            interest: ["all"],
            donations: ["all"],
            sortColumn: "",
            sortOrder: "asc",
            },
        });
        }
    });

    // EVENT MAINTENANCE PAGE:
    app.get("/events", (req, res) => {
    res.render("events");
    });

    // SURVEY MAINTENANCE PAGE (uses survey_results as the DB table)
        // For surveys: map logical column names (from UI) to real DB columns (with table aliases)
        const SURVEY_SEARCHABLE_COLUMNS = [
            'full_name',               // NEW
            'participant_first_name',
            'participant_last_name',
            'event_name',
            'event_date',
            'survey_nps_bucket'
            ];
        
            const SURVEY_COLUMN_MAP = {
            full_name: null, // special-cased in code below
            participant_first_name: 'p.participant_first_name',
            participant_last_name: 'p.participant_last_name',
            event_name: 'e.event_name',
            event_date: 'e.event_date',
            survey_nps_bucket: 's.survey_nps_bucket'
            };
    app.get('/surveys', async (req, res) => {
        try {
        // flash messages
        const sessionData = req.session || {};
        const message = sessionData.flashMessage || '';
        const messageType = sessionData.flashType || 'success';
        sessionData.flashMessage = null;
        sessionData.flashType = null;
    
        let {
            searchColumn,
            searchValue,
            eventNames,
            satisfaction,
            usefulness,
            instructor,
            recommendation,
            overall,
            nps,
            sortColumn,
            sortOrder,
        } = req.query;
    
        // defaults
        // allow "full_name" as a special case; otherwise enforce SURVEY_SEARCHABLE_COLUMNS
        if (
            !searchColumn ||
            (searchColumn !== 'full_name' && !SURVEY_SEARCHABLE_COLUMNS.includes(searchColumn))
        ) {
            searchColumn = 'participant_first_name';
        }
    
        sortOrder = sortOrder === 'desc' ? 'desc' : 'asc';
    
        // base query with joins
        // 🔁 if your join table has a different name, update "event_registrations" + its cols
        let query = knex('survey_results as s')
            .join('event_registrations as er', 's.event_registration_id', 'er.event_registration_id')
            .join('participants as p', 'er.participant_id', 'p.participant_id')
            .join('events as e', 'er.event_id', 'e.event_id')
            .select(
            's.survey_id',
            's.event_registration_id',
            'p.participant_first_name',
            'p.participant_last_name',
            'e.event_name',
            'e.event_date',
            's.survey_satisfaction_score',
            's.survey_usefulness_score',
            's.survey_instructor_score',
            's.survey_recommendation_score',
            's.survey_overall_score',
            's.survey_nps_bucket',
            's.survey_comments',
            's.submission_date as survey_submission_date',
            's.submission_time as survey_submission_time'
            );
    
        // case-insensitive search (with full_name support)
        if (searchValue) {
            const term = searchValue.trim();
            if (term) {
            if (searchColumn === 'full_name') {
                // Handle full name like "Jane", "Doe", or "Jane Doe Smith"
                const parts = term.split(/\s+/);
    
                if (parts.length === 1) {
                // One word -> match either first OR last name
                const likeOne = `%${parts[0]}%`;
                query.where(function () {
                    this.where('p.participant_first_name', 'ilike', likeOne)
                    .orWhere('p.participant_last_name', 'ilike', likeOne);
                });
                } else {
                // Multiple words -> first piece as first name, last piece as last name
                const firstLike = `%${parts[0]}%`;
                const lastLike = `%${parts[parts.length - 1]}%`;
    
                query.where(function () {
                    this.where('p.participant_first_name', 'ilike', firstLike)
                    .andWhere('p.participant_last_name', 'ilike', lastLike);
                });
                }
            } else {
                // Normal single-column search
                const dbCol = SURVEY_COLUMN_MAP[searchColumn];
                if (dbCol) {
                query.whereRaw(`CAST(${dbCol} AS TEXT) ILIKE ?`, [`%${term}%`]);
                }
            }
            }
        }
    
        // filters
        const eventNameArr = paramToArray(eventNames);
        if (!eventNameArr.includes('all')) {
            query.whereIn('e.event_name', eventNameArr);
        }
    
        const satArr = paramToArray(satisfaction);
        if (!satArr.includes('all')) {
            query.whereIn('s.survey_satisfaction_score', satArr.map(Number));
        }
    
        const usefulArr = paramToArray(usefulness);
        if (!usefulArr.includes('all')) {
            query.whereIn('s.survey_usefulness_score', usefulArr.map(Number));
        }
    
        const instrArr = paramToArray(instructor);
        if (!instrArr.includes('all')) {
            query.whereIn('s.survey_instructor_score', instrArr.map(Number));
        }
    
        const recArr = paramToArray(recommendation);
        if (!recArr.includes('all')) {
            query.whereIn('s.survey_recommendation_score', recArr.map(Number));
        }
    
        const overallArr = paramToArray(overall);
        if (!overallArr.includes('all')) {
            query.whereIn('s.survey_overall_score', overallArr.map(Number));
        }
    
        const npsArr = paramToArray(nps);
        if (!npsArr.includes('all')) {
            query.whereIn('s.survey_nps_bucket', npsArr);
        }
    
        // sorting
        if (sortColumn) {
            const sortDbCol = SURVEY_COLUMN_MAP[sortColumn];
            if (sortDbCol) {
            query.orderByRaw(`${sortDbCol} ${sortOrder}`);
            }
        }
    
        // Build option lists for filters (event names + NPS buckets)
        const eventNameOptionsPromise = knex('events')
            .distinct('event_name')
            .orderBy('event_name');
    
        const npsOptionsPromise = knex('survey_results')
            .distinct('survey_nps_bucket')
            .whereNotNull('survey_nps_bucket')
            .orderBy('survey_nps_bucket');
    
        const [eventNameRows, npsRows, results] = await Promise.all([
            eventNameOptionsPromise,
            npsOptionsPromise,
            query
        ]);
    
        const eventNameOptions = eventNameRows.map(r => r.event_name).filter(Boolean);
        const npsOptions = npsRows.map(r => r.survey_nps_bucket).filter(Boolean);
    
        const filters = {
            searchColumn,
            searchValue: searchValue || '',
            eventNames: eventNameArr,
            satisfaction: satArr,
            usefulness: usefulArr,
            instructor: instrArr,
            recommendation: recArr,
            overall: overallArr,
            nps: npsArr,
            sortColumn: sortColumn || '',
            sortOrder,
            eventNameOptions,
            npsOptions
        };
    
        res.render('surveys', {
            survey: results,
            message,
            messageType,
            filters
        });
    
        } catch (err) {
        console.error('Error loading surveys:', err);
        res.render('surveys', {
            survey: [],
            message: 'Error loading surveys',
            messageType: 'danger',
            filters: {
            searchColumn: 'participant_first_name',
            searchValue: '',
            eventNames: ['all'],
            satisfaction: ['all'],
            usefulness: ['all'],
            instructor: ['all'],
            recommendation: ['all'],
            overall: ['all'],
            nps: ['all'],
            sortColumn: '',
            sortOrder: 'asc',
            eventNameOptions: [],
            npsOptions: []
            }
        });
        }
    });
  

    // MILESTONES MAINTENANCE PAGE:
    app.get("/milestones", (req, res) => {
    res.status(418).render("milestones");
    });

    // DONATIONS MAINTENANCE PAGE:
    app.get("/donations", (req, res) => {
    res.render("donations");
    });

    // START TO LISTEN (& tell command line)
    app.listen(port, () => console.log("the server has started to listen"));
