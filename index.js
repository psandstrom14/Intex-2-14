// Paris Ward, Lucas Moraes, Joshua Ethington, Parker Sandstrom
// This code will allow users of a non profit to manage visitor information, user information, events, milestones, and donations


// REQUIRE LIBRARIES AND STORE IN VARIABLE (if applicable): 
require('dotenv').config(); // DOTENV: loads ENVIROMENT VARIABLES from .env file; Allows you to use process.env
const express = require("express"); // EXPRESS: helps with web development 
const session = require("express-session"); // EXPRESS SESSION: needed for session variable. Stored on the server to hold data; Essentially adds a new property to every req object that allows you to store a value per session.
let path = require("path"); // PATH: helps create safe paths when working with file/folder locations 
let bodyParser = require("body-parser"); // BODY-PARSER: Allows you to read the body of incoming HTTP requests and makes that data available on req.body
const knex = require("knex")({ // KNEX: allows you to work with SQL databases
    client: "pg", // connect to PostgreSQL (put database name here if something else)
    connection: { // connect to the database. If you deploy this to an internet host, you need to use process.env.DATABASE_URL
        host: process.env.RDS_HOSTNAME || "localhost",
        user: process.env.RDS_USERNAME || "postgres",
        password: process.env.RDS_PASSWORD || "admin",
        database: process.env.RDS_DB_NAME || "ella_rising",
        port: process.env.RDS_PORT || 5432,
    }
});
function paramToArray(val, defaultVal = ['all']) {
    if (!val) return defaultVal;
    return Array.isArray(val) ? val : [val];
}


// CREATE VARIABLES: 
let app = express(); // creates an express object called app
const port = process.env.PORT || 3000; // Creates variable to store port. Uses .env variable "PORT". You can also just leave that out if aren't using .env

// PATHS: 
app.set("view engine", "ejs"); // Allows you to use EJS for the web pages - requires a views folder and all files are .ejs
app.use("/images",express.static(path.join(__dirname, "images"))); // allows you to create path for images (in folder titled "images")
app.use(express.static('public'));

// MIDDLEWARE: (Middleware is code that runs between the time the request comes to the server and the time the response is sent back. It allows you to intercept and decide if the request should continue. It also allows you to parse the body request from the html form, handle errors, check authentication, etc.)
app.use(express.urlencoded({extended:true})); // Makes working with HTML forms a lot easier. Takes inputs and stores them in req.body (for post) or req.query (for get).

// HOME PAGE: 
app.get('/',(req,res) => {
    res.render("index"); 
});

// ABOUT PAGE: 
app.get('/about',(req,res) => {
    res.render("about"); 
});

// DONATE NOW PAGE: 
app.get('/donate_now',(req,res) => {
    res.render("donate_now"); 
});

// LOGIN PAGE: 
app.get('/login',(req,res) => {
    res.render("login"); 
});

// ADD ENTRY PAGE: 
    app.get('/add/:table', async (req, res) => {
        const table_name = req.params.table;
        let events = [];
        if (table_name === "surveys") {
            events = await knex("events")
                .select("event_id","event_name","event_date","event_start_time","event_end_time")
                .orderBy(["event_name","event_date","event_start_time"]);
        }
        res.render("add", { table_name, events });
    });  
    app.post("/add/survey", async (req, res) => {
        const { event_name, event_id /* UPDATE LATER plus any other survey fields */ } = req.body;

        try {
            await knex("survey").insert({
                event_name: event_name,
                event_id: event_id
                // UPDATE LATER: other columns...
            });

            res.redirect("/survey");
        } catch (err) {
            console.error("Error inserting survey:", err);
            res.status(500).send("Error saving survey");
        }
    });

// DELETE FUNCTIONALITY: 
    // Map tables to their primary key column
    const deleteConfig = {
        participants: 'participant_id',
        events: 'event_id',
        surveys: 'survey_id',
        milestones: 'milestone_id',
        donations: 'donation_id',
        users: 'user_id'
    };

    app.post('/delete-multiple', async (req, res) => {
        try {
            const { table, ids } = req.body;

            // Validate table
            const idColumn = deleteConfig[table];
            if (!idColumn) {
                console.error('Delete attempted on invalid table:', table);
                return res.status(400).send('Invalid table');
            }

            let idArray = [];
            if (typeof ids === 'string') {
                idArray = JSON.parse(ids);
            } else if (Array.isArray(ids)) {
                idArray = ids;
            }

            if (!Array.isArray(idArray) || idArray.length === 0) {
                return res.redirect('/' + table);
            }

            await knex(table).whereIn(idColumn, idArray).del();

            res.redirect('/' + table);

        } catch (err) {
            console.error('Error deleting records:', err);
            res.status(500).send('Error deleting records');
        }
    });


// USER MAINTENANCE PAGE: 
app.get('/users',(req,res) => {
    res.render("users"); 
});

// PARTICIPANT MAINTENANCE PAGE: 
    app.get('/participants', async (req, res) => {
        try {
            let {searchColumn, searchValue, city, school, interest,donations,sortColumn,sortOrder} = req.query;

            // defaults
            searchColumn = searchColumn || 'participant_first_name';
            sortOrder = sortOrder === 'desc' ? 'desc' : 'asc';

            let query = knex('participants');

            // Search
            if (searchValue && searchColumn) {
                query.where(searchColumn, 'like', `%${searchValue}%`);
            }

            // City filter
            const cityArr = paramToArray(city);
            if (!cityArr.includes('all')) {
                query.whereIn('participant_city', cityArr);
            }

            // School filter
            const schoolArr = paramToArray(school);
            if (!schoolArr.includes('all')) {
                query.whereIn('participant_school_or_employer', schoolArr);
            }

            // Interest filter
            const interestArr = paramToArray(interest);
            if (!interestArr.includes('all')) {
                query.whereIn('participant_field_of_interest', interestArr);
            }

            // Donations filter
            const donationsArr = paramToArray(donations);
            if (!donationsArr.includes('all')) {
                if (donationsArr.includes('Yes') && !donationsArr.includes('No')) {
                    query.where('total_donations', '>', 0);
                } else if (donationsArr.includes('No') && !donationsArr.includes('Yes')) {
                    query.where(qb => {
                        qb.where('total_donations', 0).orWhereNull('total_donations');
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
                searchValue: searchValue || '',
                city: cityArr,
                school: schoolArr,
                interest: interestArr,
                donations: donationsArr,
                sortColumn: sortColumn || '',
                sortOrder
            };

            res.render('participants', {
                participant: results,
                message: '',
                messageType: 'success',
                filters
            });

        } catch (err) {
            console.error('Error loading participants:', err);
            res.render('participants', {
                participant: [],
                message: 'Error loading participants',
                messageType: 'danger',
                filters: {
                    searchColumn: 'participant_first_name',
                    searchValue: '',
                    city: ['all'],
                    school: ['all'],
                    interest: ['all'],
                    donations: ['all'],
                    sortColumn: '',
                    sortOrder: 'asc'
                }
            });
        }
    });

// EVENT MAINTENANCE PAGE: 
app.get('/events',(req,res) => {
    res.render("events"); 
});

// SURVEY MAINTENANCE PAGE: 
// GET: Surveys page
app.get('/surveys', (req, res) => {
    knex.select().from('surveys')
        .then(table => {
            res.render('surveys', {
                survey: table,
                message: '',
                messageType: 'success',
                // initial filter state
                filters: {
                    searchColumn: 'survey_id',
                    searchValue: '',
                    nps: ['all'],          // NPS bucket filter
                    comments: ['all'],     // Has comments filter
                    sortColumn: '',
                    sortOrder: 'asc'
                }
            });
        })
        .catch(err => {
            console.log(err);
            res.status(500).json({ err });
        });
});
app.post('/filter-surveys', (req, res) => {
    let {
        searchColumn,
        searchValue,
        nps,
        comments,
        sortColumn,
        sortOrder,
        npsFilters,
        commentsFilters
    } = req.body;

    // Handle filter arrays passed as JSON strings from the form
    if (npsFilters && typeof npsFilters === 'string') {
        try {
            nps = JSON.parse(npsFilters);
        } catch (e) {
            nps = ['all'];
        }
    }

    if (commentsFilters && typeof commentsFilters === 'string') {
        try {
            comments = JSON.parse(commentsFilters);
        } catch (e) {
            comments = ['all'];
        }
    }

    // Default search column
    if (!searchColumn) {
        searchColumn = 'survey_id';
    }

    // Start knex query
    let query = knex('surveys');

    // Search (string-based like on participants page)
    if (searchColumn && searchValue) {
        query = query.where(searchColumn, 'like', `%${searchValue}%`);
    }

    // NPS filter (survey_nps_bucket)
    if (nps && !nps.includes('all')) {
        const npsArray = Array.isArray(nps) ? nps : [nps];
        query = query.whereIn('survey_nps_bucket', npsArray);
    }

    // Comments filter: Yes = has non-empty comments, No = null/empty
    if (comments && !comments.includes('all')) {
        const commentsArray = Array.isArray(comments) ? comments : [comments];

        if (commentsArray.includes('Yes') && !commentsArray.includes('No')) {
            query = query.whereNotNull('survey_comments')
                        .andWhereRaw("TRIM(survey_comments) <> ''");
        } else if (commentsArray.includes('No') && !commentsArray.includes('Yes')) {
            query = query.where(function () {
                this.whereNull('survey_comments')
                    .orWhereRaw("TRIM(survey_comments) = ''");
            });
        }
    }

    // Sorting
    if (sortColumn) {
        query = query.orderBy(sortColumn, sortOrder === 'desc' ? 'desc' : 'asc');
    }

    // Execute query and render
    query.then(results => {
        const npsArray = nps ? (Array.isArray(nps) ? nps : [nps]) : ['all'];
        const commentsArray = comments ? (Array.isArray(comments) ? comments : [comments]) : ['all'];

        res.render('surveys', {
            survey: results,
            message: 'Surveys filtered successfully',
            messageType: 'success',
            filters: {
                searchColumn: searchColumn || 'survey_id',
                searchValue: searchValue || '',
                nps: npsArray,
                comments: commentsArray,
                sortColumn: sortColumn || '',
                sortOrder: sortOrder || 'asc'
            }
        });
    }).catch(err => {
        console.error(err);
        res.render('surveys', {
            survey: [],
            message: 'Error filtering surveys',
            messageType: 'danger',
            filters: {
                searchColumn: 'survey_id',
                searchValue: '',
                nps: ['all'],
                comments: ['all'],
                sortColumn: '',
                sortOrder: 'asc'
            }
        });
    });
});
// Route for sorting via column headers (preserves existing filters)
app.post('/sort-surveys', (req, res) => {
    let {
        searchColumn,
        searchValue,
        nps,
        comments,
        sortColumn,
        sortOrder
    } = req.body;

    // Default search column
    if (!searchColumn) {
        searchColumn = 'survey_id';
    }

    let query = knex('surveys');

    // Search
    if (searchColumn && searchValue) {
        query = query.where(searchColumn, 'like', `%${searchValue}%`);
    }

    // NPS filter
    if (nps && !nps.includes('all')) {
        const npsArray = Array.isArray(nps) ? nps : [nps];
        query = query.whereIn('survey_nps_bucket', npsArray);
    }

    // Comments filter
    if (comments && !comments.includes('all')) {
        const commentsArray = Array.isArray(comments) ? comments : [comments];

        if (commentsArray.includes('Yes') && !commentsArray.includes('No')) {
            query = query.whereNotNull('survey_comments')
                        .andWhereRaw("TRIM(survey_comments) <> ''");
        } else if (commentsArray.includes('No') && !commentsArray.includes('Yes')) {
            query = query.where(function () {
                this.whereNull('survey_comments')
                    .orWhereRaw("TRIM(survey_comments) = ''");
            });
        }
    }

    // Sorting
    if (sortColumn) {
        query = query.orderBy(sortColumn, sortOrder === 'desc' ? 'desc' : 'asc');
    }

    query.then(results => {
        const npsArray = nps ? (Array.isArray(nps) ? nps : [nps]) : ['all'];
        const commentsArray = comments ? (Array.isArray(comments) ? comments : [comments]) : ['all'];

        res.render('surveys', {
            survey: results,
            message: '',
            messageType: 'success',
            filters: {
                searchColumn: searchColumn || 'survey_id',
                searchValue: searchValue || '',
                nps: npsArray,
                comments: commentsArray,
                sortColumn: sortColumn || '',
                sortOrder: sortOrder || 'asc'
            }
        });
    }).catch(err => {
        console.error(err);
        res.render('surveys', {
            survey: [],
            message: 'Error sorting surveys',
            messageType: 'danger',
            filters: {
                searchColumn: 'survey_id',
                searchValue: '',
                nps: ['all'],
                comments: ['all'],
                sortColumn: '',
                sortOrder: 'asc'
            }
        });
    });
});



// MILESTONES MAINTENANCE PAGE: 
app.get('/milestones',(req,res) => {
    res.status(418).render("milestones"); 
});

// DONATIONS MAINTENANCE PAGE: 
app.get('/donations',(req,res) => {
    res.render("donations"); 
});

// START TO LISTEN (& tell command line)
app.listen(port,() => console.log("the server has started to listen"));