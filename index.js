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
        host: "localhost",
        user: "postgres",
        password: "admin",
        database: "ella_rising", // put database name
        port: 5432
    }
});

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

// USER MAINTENANCE PAGE: 
app.get('/users',(req,res) => {
    res.render("users"); 
});

// PARTICIPANT MAINTENANCE PAGE: 
app.get('/participants',(req,res) => {
    knex.select().from('participants').then(table => { 
        res.render("participants", {
            participant: table,
            message: '',
            messageType: 'success',
            // Initialize empty filters for first page load
            filters: {
                searchColumn: '',
                searchValue: '',
                city: ['all'],
                school: ['all'],
                interest: ['all'],
                donations: ['all'],
                sortColumn: '',
                sortOrder: 'asc'
            }
        }); 
    }).catch(err => { 
        console.log(err); 
        res.status(500).json({err});
    });
});
app.post('/filter', (req, res) => {
    const { 
        searchColumn, 
        searchValue, 
        city, 
        school, 
        interest, 
        donations,
        sortColumn, 
        sortOrder 
    } = req.body;

    // Start with knex query builder
    let query = knex('participants');

    // Advanced Search
    if (searchColumn && searchValue) {
        query = query.where(searchColumn, 'like', `%${searchValue}%`);
    }

    // City Filter
    if (city && !city.includes('all')) {
        const cityArray = Array.isArray(city) ? city : [city];
        query = query.whereIn('participant_city', cityArray);
    }

    // School Filter
    if (school && !school.includes('all')) {
        const schoolArray = Array.isArray(school) ? school : [school];
        query = query.whereIn('participant_school_or_employer', schoolArray);
    }

    // Interest Filter
    if (interest && !interest.includes('all')) {
        const interestArray = Array.isArray(interest) ? interest : [interest];
        query = query.whereIn('participant_field_of_interest', interestArray);
    }

    // Donations Filter
    if (donations && !donations.includes('all')) {
        const donationsArray = Array.isArray(donations) ? donations : [donations];
        if (donationsArray.includes('Yes') && !donationsArray.includes('No')) {
            query = query.where('total_donations', '>', 0);
        } else if (donationsArray.includes('No') && !donationsArray.includes('Yes')) {
            query = query.where(function() {
                this.where('total_donations', 0).orWhereNull('total_donations');
            });
        }
    }

    // Sorting
    if (sortColumn) {
        query = query.orderBy(sortColumn, sortOrder === 'desc' ? 'desc' : 'asc');
    }

    // Execute query and render results
    query.then(results => {
        // Prepare filter arrays - ensure they're always arrays
        const cityArray = city ? (Array.isArray(city) ? city : [city]) : ['all'];
        const schoolArray = school ? (Array.isArray(school) ? school : [school]) : ['all'];
        const interestArray = interest ? (Array.isArray(interest) ? interest : [interest]) : ['all'];
        const donationsArray = donations ? (Array.isArray(donations) ? donations : [donations]) : ['all'];

        res.render('participants', { 
            participant: results,
            message: '',
            messageType: 'success',
            // Pass filter values back to maintain state
            filters: {
                searchColumn: searchColumn || '',
                searchValue: searchValue || '',
                city: cityArray,
                school: schoolArray,
                interest: interestArray,
                donations: donationsArray,
                sortColumn: sortColumn || '',
                sortOrder: sortOrder || 'asc'
            }
        });
    }).catch(err => {
        console.error(err);
        res.render('participants', { 
            participant: [], 
            message: 'Error filtering participants', 
            messageType: 'danger',
            filters: {
                searchColumn: '',
                searchValue: '',
                city: ['all'],
                school: ['all'],
                interest: ['all'],
                donations: ['all'],
                sortColumn: '',
                sortOrder: 'asc'
            }
        });
    });
});

// EVENT MAINTENANCE PAGE: 
app.get('/events',(req,res) => {
    res.render("events"); 
});

// SURVEY MAINTENANCE PAGE: 
app.get('/surveys',(req,res) => {
    res.render("surveys"); 
});

// MILESTONES MAINTENANCE PAGE: 
app.get('/milestones',(req,res) => {
    res.render("milestones"); 
});

// DONATINOS MAINTENANCE PAGE: 
app.get('/donations',(req,res) => {
    res.render("donations"); 
});

// START TO LISTEN (& tell command line)
app.listen(port,() => console.log("the server has started to listen")); 

