// Paris Ward, Lucas Moraes, Joshua Ethington, Parker Sandstrom
// This code will allow users of a non profit to manage visitor information, user information, events, milestones, and donations

// REQUIRE LIBRARIES AND STORE IN VARIABLE (if applicable):
require("dotenv").config(); // DOTENV: loads ENVIROMENT VARIABLES from .env file; Allows you to use process.env
const express = require("express"); // EXPRESS: helps with web development
const session = require("express-session"); // EXPRESS SESSION: needed for session variable. Stored on the server to hold data; Essentially adds a new property to every req object that allows you to store a value per session.
let path = require("path"); // PATH: helps create safe paths when working with file/folder locations
let bodyParser = require("body-parser"); // BODY-PARSER: Allows you to read the body of incoming HTTP requests and makes that data available on req.body
const knex = require("knex")({
  // KNEX: allows you to work with SQL databases
  client: "pg", // connect to PostgreSQL (put database name here if something else)
  connection: {
    // connect to the database. If you deploy this to an internet host, you need to use process.env.DATABASE_URL
    host:
      process.env.RDS_HOSTNAME ||
      "awseb-e-zmtvhhdgpm-stack-awsebrdsdatabase-cjcdmyxevp9y.c128cucaotxd.us-east-2.rds.amazonaws.com",
    user: process.env.RDS_USERNAME || "intex214",
    password: process.env.RDS_PASSWORD || "Hopethisworks1",
    database: process.env.RDS_DB_NAME || "ebdb",
    port: process.env.RDS_PORT || 5432,
    ssl: { rejectUnauthorized: false },
  },
});

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
  })
);

// OTHER SETUP:
// Ensures a value is returned as an array, using a default if value is empty.
function paramToArray(val, defaultVal = ["all"]) {
  if (!val) return defaultVal;
  return Array.isArray(val) ? val : [val];
}
// language functionality
app.use((req, res, next) => {
  res.locals.language = req.session.language || "en";
  next();
});

// MIDDLEWARE:
app.use(express.urlencoded({ extended: true })); // Makes working with HTML forms a lot easier. Takes inputs and stores them in req.body (for post) or req.query (for get).

//Login middleware
app.use((req, res, next) => {
  res.locals.isLoggedIn = req.session.isLoggedIn || false;
  res.locals.role = req.session.user?.role || null;
  res.locals.userId = req.session.user?.id || null;
  res.locals.username = req.session.user?.username || null;
  next();
});

// // Content Security Policy middleware - allows localhost connections for development
// app.use((req, res, next) => {
//     res.setHeader(
//     'Content-Security-Policy',
//     "default-src 'self' http://localhost:* ws://localhost:* wss://localhost:*; " +
//     "connect-src 'self' http://localhost:* ws://localhost:* wss://localhost:*; " +
//     "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
//     "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; " +
//     "img-src 'self' data: https:; " +
//     "font-src 'self' https://cdn.jsdelivr.net;"
//     );
//     next();
// });

// Global authentication middleware - runs on EVERY request (Needed for login functionality)
app.use((req, res, next) => {
  // Skip authentication for specific login routes
  if (
    req.path === "/" ||
    req.path === "/index" ||
    req.path === "/about" ||
    req.path === "/performance" ||
    req.path === "/calendar" ||
    req.path === "/donate_now" ||
    req.path === "/login" ||
    req.path === "/logout" ||
    req.path === "/signup"
  ) {
    //continue with the request path
    return next();
  }

  // Check if user is logged in for all other routes
  if (req.session.isLoggedIn) {
    next(); // User is logged in, continue
  } else {
    // Store the original URL they wanted to access
    req.session.returnTo = req.originalUrl || req.url;
    res.render("login", { error_message: "Please log in to access this page" });
  }
});

// LOGIN PAGE:
// Route to display login page:
app.get("/login", (req, res) => {
  res.render("login");
});

// Route to login user & gather information
app.post("/login", (req, res) => {
  let username = req.body.username;
  let password = req.body.password;

  knex
    .select()
    .from("participants")
    .where({ participant_username: username, participant_password: password })
    .first()
    .then((user) => {
      if (user) {
        req.session.user = {
          id: user.participant_id,
          username: user.participant_username,
          role: user.participant_role,
        };
        req.session.isLoggedIn = true;

        // Check if there's a stored return URL
        const returnTo =
          req.session.returnTo || `/profile/${user.participant_id}`;
        delete req.session.returnTo; // Clear it after use
        res.redirect(returnTo);
      } else {
        res.render("login", { error_message: "Invalid credentials" });
      }
    })
    .catch((err) => {
      console.error(err);
      res.render("login", { error_message: "Database error" });
    });
});

app.get("/logout", (req, res) => {
  req.session.isLoggedIn = false;
  req.session.user = null;
  req.session.destroy((err) => {
    if (err) {
      console.error("Error logging out:", err);
    }
    res.redirect("/");
  });
});

// SIGN UP PAGE:
app.get("/signup", (req, res) => {
  res.render("signup");
});
// SIGNUP + AUTO-LOGIN
app.post("/signup", async (req, res) => {
  try {
    const newData = req.body;

    // Insert new participant and get the full row back
    const [user] = await knex("participants").insert(newData).returning("*"); // returns the inserted row in PostgreSQL

    // Auto-login: set up the same session structure as in /login
    req.session.user = {
      id: user.participant_id,
      username: user.participant_username,
      role: user.participant_role, // make sure this column exists
    };
    req.session.isLoggedIn = true;

    // Redirect to their profile
    res.redirect(`/profile/${user.participant_id}`);
  } catch (err) {
    console.log("Error signing up", err.message);
    res.status(500).json({ error: err.message });
  }
});

// LANGUAGE BOXES:
app.post("/set-language", (req, res) => {
  const { lang } = req.body;

  // simple validation: only allow expected languages
  const allowedLangs = [
    "en",
    "es",
    "fr",
    "de",
    "pt",
    "ar",
    "zh-CN",
    "ja",
    "ko",
  ];

  if (!allowedLangs.includes(lang)) {
    return res
      .status(400)
      .json({ success: false, message: "Invalid language" });
  }

  req.session.language = lang;
  res.json({ success: true });
});

/* ROUTES */
// HOME PAGE: general landing page that displays information about the company
app.get("/", (req, res) => {
  res.render("index");
});

// ABOUT PAGE: gives more in dept details about the company as well as embedded a video
app.get("/about", (req, res) => {
  res.render("about");
});

// PERFORMANCE PAGE: This page will tell more information about ER as well as allow users to view a tableau dashboard with information about the webpage
app.get("/performance", (req, res) => {
  res.render("performance");
});

// CALENDAR PAGE: will allow anyone to see the events. If logged in, will have event registration functionality
app.get("/calendar", async (req, res) => {
  // Helper function to format time from 24-hour to 12-hour format
  function formatTime(timeString) {
    if (!timeString) return "";

    // If it's already formatted (contains AM/PM), return as is
    if (timeString.includes("AM") || timeString.includes("PM")) {
      return timeString;
    }

    // Handle time string formats like "14:30:00" or "14:30"
    const timeParts = timeString.toString().split(":");
    let hours = parseInt(timeParts[0]);
    const minutes = timeParts[1] || "00";

    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'

    return `${hours}:${minutes} ${ampm}`;
  }

  // code for calendar information
  try {
    // Get flash messages
    const sessionData = req.session || {};
    const message = sessionData.flashMessage || "";
    const messageType = sessionData.flashType || "success";
    sessionData.flashMessage = null;
    sessionData.flashType = null;

    // Get user's registered events if logged in
    let userRegisteredEventIds = [];
    if (req.session.user && req.session.user.id) {
      const userRegistrations = await knex("event_registrations")
        .where("participant_id", req.session.user.id)
        .whereIn("registration_status", ["registered", "attended"])
        .select("event_id");

      userRegisteredEventIds = userRegistrations.map((reg) => reg.event_id);
    }

    // Calculate date range for next 3 months
    const today = new Date();
    const endDate = new Date(today);
    endDate.setMonth(endDate.getMonth() + 3);

    // Format dates for SQL query (YYYY-MM-DD)
    const startDateStr = today.toISOString().split("T")[0];
    const endDateStr = endDate.toISOString().split("T")[0];

    // Get all events in the next 3 months using Knex
    const events = await knex("events")
      .select(
        "event_id",
        "event_name",
        "event_date",
        "event_start_time",
        "event_end_time",
        "event_location",
        "event_capacity",
        "registration_deadline_date",
        "registration_deadline_time"
      )
      .where("event_date", ">=", startDateStr)
      .where("event_date", "<=", endDateStr)
      .orderBy("event_date", "asc")
      .orderBy("event_start_time", "asc");

    // For each event, count the number of registrations
    const eventsWithCounts = await Promise.all(
      events.map(async (event) => {
        const registrationCount = await knex("event_registrations")
          .where("event_id", event.event_id)
          .where(function () {
            this.where("registration_attended_flag", 1)
              .orWhere("registration_status", "registered")
              .orWhere("registration_status", "attended");
          })
          .count("* as count")
          .first();

        // Check if current user is registered for this event
        const isUserRegistered = userRegisteredEventIds.includes(
          event.event_id
        );

        // return count of registered per event
        return {
          ...event,
          registered_count: parseInt(registrationCount.count) || 0,
          user_registered: isUserRegistered,
        };
      })
    );

    // Build month data structures
    const months = [];
    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];

    for (let i = 0; i < 3; i++) {
      const monthDate = new Date(today.getFullYear(), today.getMonth() + i, 1);
      const year = monthDate.getFullYear();
      const monthNum = monthDate.getMonth() + 1;
      const monthName = monthNames[monthDate.getMonth()];

      // Get first day of week (0 = Sunday, 6 = Saturday)
      const startDay = monthDate.getDay();

      // Get number of days in month
      const daysInMonth = new Date(year, monthNum, 0).getDate();

      // Create events object organized by date
      const monthEvents = {};
      eventsWithCounts.forEach((event) => {
        const eventDate = new Date(event.event_date);
        if (
          eventDate.getMonth() === monthDate.getMonth() &&
          eventDate.getFullYear() === year
        ) {
          // Convert event_date to YYYY-MM-DD string for the key
          const dateKey = eventDate.toISOString().split("T")[0];
          if (!monthEvents[dateKey]) {
            monthEvents[dateKey] = [];
          }

          // Format times for display (convert from 24-hour to 12-hour format)
          const formattedEvent = {
            event_id: event.event_id,
            event_name: event.event_name,
            event_date: event.event_date,
            start_time: formatTime(event.event_start_time),
            end_time: formatTime(event.event_end_time),
            location: event.event_location,
            capacity: event.event_capacity,
            registered_count: event.registered_count,
            user_registered: event.user_registered,
            registration_deadline: event.registration_deadline_date,
          };
          monthEvents[dateKey].push(formattedEvent);
        }
      });

      months.push({
        name: monthName,
        year: year,
        monthNum: monthNum,
        startDay: startDay,
        daysInMonth: daysInMonth,
        events: monthEvents,
      });
    }

    // Get today's date string for highlighting
    const todayStr = today.toISOString().split("T")[0];

    res.render("calendar", {
      title: "Event Calendar",
      months: months,
      today: todayStr,
      message: message,
      messageType: messageType,
      isLoggedIn: !!(req.session.user && req.session.user.id),
    });
  } catch (err) {
    console.error("Error loading calendar:", err);
    res.status(500).send("Error loading calendar: " + err.message);
  }
});

// ADD EVENT REGISTRATION FUNCTIONALITY (USER END):
// this is the functionality that allows a user to register for an event from the "calendar page"
app.post("/register-event/:eventId", async (req, res) => {
  const eventId = req.params.eventId;

  try {
    // ===== TEMPORARY: Mock logged-in user for testing =====
    if (!req.session.user) {
      req.session.user = {
        id: 70, // Change this to a valid participant_id from your database
        username: "testuser",
        role: "participant",
      };
    }
    // ===== END TEMPORARY CODE =====
    // Get event details
    const event = await knex("events").where("event_id", eventId).first();

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    // Get current registration count
    const registrationCount = await knex("event_registrations")
      .where("event_id", eventId)
      .where(function () {
        this.where("registration_attended_flag", 1)
          .orWhere("registration_status", "registered")
          .orWhere("registration_status", "attended");
      })
      .count("* as count")
      .first();

    const registered = parseInt(registrationCount.count) || 0;
    const seatsLeft = event.event_capacity - registered;

    // Check if user is logged in
    if (!req.session.user) {
      return res.status(401).json({
        success: false,
        message: "You must be logged in to register",
        redirect: "/login",
      });
    }

    // Check if event is full
    if (seatsLeft <= 0) {
      return res.status(400).json({
        success: false,
        message: "Sorry, this event is full.",
      });
    }

    // Check if user is already registered
    const existingRegistration = await knex("event_registrations")
      .where("event_id", eventId)
      .where("participant_id", req.session.user.id)
      .first();

    if (existingRegistration) {
      return res.status(400).json({
        success: false,
        message: "You are already registered for this event.",
      });
    }

    // Create registration
    await knex("event_registrations").insert({
      participant_id: req.session.user.id,
      event_id: eventId,
      registration_status: "registered",
      registration_attended_flag: 0,
      registration_created_at_date: new Date().toISOString().split("T")[0],
      registration_created_at_time: new Date().toTimeString().split(" ")[0],
    });

    // Format dates for Google Calendar
    // Google Calendar expects format: YYYYMMDDTHHMMSSZ
    const eventDate = new Date(event.event_date);
    const startTime = event.event_start_time.split(":");
    const endTime = event.event_end_time.split(":");

    eventDate.setHours(parseInt(startTime[0]), parseInt(startTime[1]), 0);
    const startGcal = eventDate
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");

    eventDate.setHours(parseInt(endTime[0]), parseInt(endTime[1]), 0);
    const endGcal = eventDate
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");

    // Return success with event details
    res.json({
      success: true,
      message: "Successfully registered!",
      event: {
        event_id: event.event_id,
        event_name: event.event_name,
        event_date: event.event_date,
        event_start_time: event.event_start_time,
        event_end_time: event.event_end_time,
        event_location: event.event_location,
        start_gcal: startGcal,
        end_gcal: endGcal,
      },
    });
  } catch (err) {
    console.error("Error registering for event:", err);
    res.status(500).json({
      success: false,
      message: "Error registering for event.",
    });
  }
});

// CANCEL EVENT REGISTRATION FUNCTIONALITY (USER END):
app.post("/cancel-registration/:eventId", async (req, res) => {
  const eventId = req.params.eventId;

  try {
    // ===== TEMPORARY: Mock logged-in user =====
    const TEST_USER_ID = 70; // ← Change this to match your test user
    // ==========================================

    // Get event details
    const event = await knex("events").where("event_id", eventId).first();

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    // Check if user has a registration for this event
    const existingRegistration = await knex("event_registrations")
      .where("event_id", eventId)
      .where("participant_id", TEST_USER_ID)
      .whereIn("registration_status", ["registered", "attended"])
      .first();

    if (!existingRegistration) {
      return res.status(400).json({
        success: false,
        message: "You are not registered for this event.",
      });
    }

    // Update registration status to 'cancelled'
    await knex("event_registrations")
      .where(
        "event_registration_id",
        existingRegistration.event_registration_id
      )
      .update({
        registration_status: "cancelled",
      });

    // Return success
    res.json({
      success: true,
      message: "Registration cancelled successfully",
      event: {
        event_name: event.event_name,
      },
    });
  } catch (err) {
    console.error("Error cancelling registration:", err);
    res.status(500).json({
      success: false,
      message: "Error cancelling registration.",
    });
  }
});

// DONATE NOW PAGE: this page will take user inputs for donation information/details
app.get("/donate_now", (req, res) => {
  res.render("donate_now");
});

// PROFILE PAGE: will display user profile information, as well as individualized tables for milestones, donations, event registrations, and survey results
// Route to display profile page (takes input id, which can be the users id or the id from the participants table)
app.get("/profile/:id", async (req, res) => {
  const participantId = req.params.id;

  try {
    // Get participant information with total donations
    const participant = await knex("participants")
      .leftJoin(
        "donations",
        "participants.participant_id",
        "donations.participant_id"
      )
      .where("participants.participant_id", participantId)
      .groupBy("participants.participant_id")
      .select(
        "participants.participant_id",
        "participants.participant_email",
        "participants.participant_first_name",
        "participants.participant_last_name",
        "participants.participant_dob",
        "participants.participant_role",
        "participants.participant_phone",
        "participants.participant_city",
        "participants.participant_state",
        "participants.participant_zip",
        "participants.participant_school_or_employer",
        "participants.participant_field_of_interest",
        "participants.participant_username",
        knex.raw(
          'COALESCE(SUM(donations.donation_amount), 0) as "Total_Donations"'
        )
      )
      .first();

    // Check if participant exists
    if (!participant) {
      return res.status(404).send("Participant not found");
    }

    // Convert Total_Donations to a number
    participant.Total_Donations = parseFloat(participant.Total_Donations) || 0;

    // Get milestones sorted by most recent first
    const milestones = await knex("milestones")
      .where("participant_id", participantId)
      .select(
        "milestone_id",
        "milestone_title",
        "milestone_date",
        "milestone_category"
      )
      .orderBy("milestone_date", "desc");

    // Get donations sorted by most recent first
    const donations = await knex("donations")
      .select("donation_id", "donation_date", "donation_amount")
      .orderBy("donation_date", "desc");

    // Convert donation amounts to numbers
    donations.forEach((donation) => {
      donation.donation_amount = parseFloat(donation.donation_amount) || 0;
    });

    // Get event registrations sorted by most recent first
    const eventRegistrations = await knex("event_registrations")
      .where("participant_id", participantId)
      .select(
        "event_registration_id",
        "participant_id",
        "event_id",
        "registration_status",
        "registration_attended_flag",
        "registration_created_at_date",
        "registration_created_at_time",
        "registration_check_in_date",
        "registration_check_in_time"
      )
      .orderBy([
        { column: "registration_created_at_date", order: "desc" },
        { column: "registration_created_at_time", order: "desc" },
      ]);

    // Get survey results through event_registrations join
    const surveys = await knex("survey_results as sr")
      .innerJoin(
        "event_registrations as er",
        "sr.event_registration_id",
        "er.event_registration_id"
      )
      .where("er.participant_id", participantId)
      .select(
        "sr.survey_id",
        "sr.event_registration_id",
        "sr.survey_satisfaction_score",
        "sr.survey_usefulness_score",
        "sr.survey_instructor_score",
        "sr.survey_recommendation_score",
        "sr.survey_overall_score",
        "sr.survey_nps_bucket",
        "sr.survey_comments",
        "sr.submission_date",
        "sr.submission_time"
      )
      .orderBy([
        { column: "sr.submission_date", order: "desc" },
        { column: "sr.submission_time", order: "desc" },
      ]);

    // Convert survey scores to numbers
    surveys.forEach((survey) => {
      survey.survey_satisfaction_score =
        parseFloat(survey.survey_satisfaction_score) || null;
      survey.survey_usefulness_score =
        parseFloat(survey.survey_usefulness_score) || null;
      survey.survey_instructor_score =
        parseFloat(survey.survey_instructor_score) || null;
      survey.survey_recommendation_score =
        parseFloat(survey.survey_recommendation_score) || null;
      survey.survey_overall_score =
        parseFloat(survey.survey_overall_score) || null;
    });

    // Render the page with all data
    res.render("profile", {
      participant: participant,
      milestones: milestones,
      donations: donations,
      eventRegistrations: eventRegistrations,
      surveys: surveys,
    });
  } catch (error) {
    console.error("Error loading profile dashboard:", error);
    res.status(500).send("Error loading profile dashboard");
  }
});

/* DASHBOARD PAGES */
// USERS MAINTENANCE PAGE:
app.get("/users", async (req, res) => {
  try {
    // flash messages + query messages
    const sessionData = req.session || {};
    let message = sessionData.flashMessage || "";
    let messageType = sessionData.flashType || "success";

    sessionData.flashMessage = null;
    sessionData.flashType = null;

    // fallback to query params (for deletes)
    if (!message && req.query.message) {
      message = req.query.message;
      messageType = req.query.messageType || "success";
    }

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
    searchColumn = searchColumn || "full_name";
    sortOrder = sortOrder === "desc" ? "desc" : "asc";

    // Query ALL users (no role filter)
    let query = knex("participants");

    // Filter by role - only show participants
    query.where("participant_role", "participant");

    // Case-insensitive search
    if (searchValue && searchColumn) {
      const term = searchValue.trim();
      if (term) {
        if (searchColumn === "full_name") {
          const parts = term.split(/\s+/);
          if (parts.length === 1) {
            const likeOne = `%${parts[0]}%`;
            query.where(function () {
              this.where("participant_first_name", "ilike", likeOne).orWhere(
                "participant_last_name",
                "ilike",
                likeOne
              );
            });
          } else {
            const firstLike = `%${parts[0]}%`;
            const lastLike = `%${parts[parts.length - 1]}%`;
            query.where(function () {
              this.where("participant_first_name", "ilike", firstLike).andWhere(
                "participant_last_name",
                "ilike",
                lastLike
              );
            });
          }
        } else {
          const likeTerm = `%${term}%`;
          query.whereRaw(`CAST(${searchColumn} AS TEXT) ILIKE ?`, [likeTerm]);
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
      } else if (donationsArr.includes("No") && !donationsArr.includes("Yes")) {
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

    res.render("users", {
      participant: results,
      message,
      messageType,
      filters,
      isLoggedIn: req.session.isLoggedIn || false,
      userId: req.session.user?.id || null,
      role: req.session.user?.role || null,
    });
  } catch (err) {
    console.error("Error loading users:", err);
    res.render("users", {
      participant: [],
      message: "Error loading users",
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
      isLoggedIn: req.session.isLoggedIn || false,
      userId: req.session.user?.id || null,
      role: req.session.user?.role || null,
    });
  }
});

// PARTICIPANT MAINTENANCE PAGE:
app.get("/participants", async (req, res) => {
  try {
    // flash messages + query messages
    const sessionData = req.session || {};
    let message = sessionData.flashMessage || "";
    let messageType = sessionData.flashType || "success";

    sessionData.flashMessage = null;
    sessionData.flashType = null;

    // fallback to query params (for deletes)
    if (!message && req.query.message) {
      message = req.query.message;
      messageType = req.query.messageType || "success";
    }

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
    searchColumn = searchColumn || "full_name";
    sortOrder = sortOrder === "desc" ? "desc" : "asc";

    let query = knex("participants");

    // Filter by role - only show participants
    query.where("participant_role", "participant");

    // Case-insensitive search
    if (searchValue && searchColumn) {
      const term = searchValue.trim();
      if (term) {
        if (searchColumn === "full_name") {
          // for full name, do this:
          // Split "Jane Doe Smith" into parts
          const parts = term.split(/\s+/);

          if (parts.length === 1) {
            // One word: search first OR last name
            const likeOne = `%${parts[0]}%`;
            query.where(function () {
              this.where("participant_first_name", "ilike", likeOne).orWhere(
                "participant_last_name",
                "ilike",
                likeOne
              );
            });
          } else {
            // Multiple words: use first piece as first name, last piece as last name
            const firstLike = `%${parts[0]}%`;
            const lastLike = `%${parts[parts.length - 1]}%`;

            query.where(function () {
              this.where("participant_first_name", "ilike", firstLike).andWhere(
                "participant_last_name",
                "ilike",
                lastLike
              );
            });
          }
        } else {
          // Existing behavior for single column (non full_name searches)
          const likeTerm = `%${term}%`;
          query.whereRaw(`CAST(${searchColumn} AS TEXT) ILIKE ?`, [likeTerm]);
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
      } else if (donationsArr.includes("No") && !donationsArr.includes("Yes")) {
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
// EVENT MAINTENANCE PAGE:
app.get("/events", async (req, res) => {
  try {
    // flash messages + query messages
    const sessionData = req.session || {};
    let message = sessionData.flashMessage || "";
    let messageType = sessionData.flashType || "success";

    sessionData.flashMessage = null;
    sessionData.flashType = null;

    // fallback to query params (for deletes)
    if (!message && req.query.message) {
      message = req.query.message;
      messageType = req.query.messageType || "success";
    }

    // --- filtering/sorting code ---
    let {
      searchColumn,
      searchValue,
      eventNames,
      locations,
      eventTypes,
      months,
      years,
      sortColumn,
      sortOrder,
    } = req.query;

    // defaults
    searchColumn = searchColumn || "event_name";
    sortOrder = sortOrder === "desc" ? "desc" : "asc";

    // Base query with join to event_types table
    let query = knex("events as e")
      .leftJoin("event_types as et", "e.event_type_id", "et.event_type_id")
      .select(
        "e.event_id",
        "e.event_type_id",
        "e.event_name",
        "e.event_date",
        "e.event_start_time",
        "e.event_end_time",
        "e.event_location",
        "e.event_capacity",
        "e.registration_deadline_date",
        "e.registration_deadline_time",
        "et.event_type"
      );

    // Case-insensitive search
    if (searchValue && searchColumn) {
      const term = searchValue.trim();
      if (term) {
        const likeTerm = `%${term}%`;
        // Handle different column types
        if (searchColumn === "event_capacity") {
          // For numeric columns, try to match as number
          const numTerm = parseInt(term);
          if (!isNaN(numTerm)) {
            query.where("e.event_capacity", numTerm);
          }
        } else {
          // For text columns, use ILIKE
          query.whereRaw(`CAST(e.${searchColumn} AS TEXT) ILIKE ?`, [likeTerm]);
        }
      }
    }

    // Event Names filter
    const eventNameArr = paramToArray(eventNames);
    if (!eventNameArr.includes("all")) {
      query.whereIn("e.event_name", eventNameArr);
    }

    // Locations filter
    const locationArr = paramToArray(locations);
    if (!locationArr.includes("all")) {
      query.whereIn("e.event_location", locationArr);
    }

    // Event Types filter (from joined event_types table)
    const eventTypeArr = paramToArray(eventTypes);
    if (!eventTypeArr.includes("all")) {
      query.whereIn("et.event_type", eventTypeArr);
    }

    // Months filter (extract month from event_date)
    const monthArr = paramToArray(months);
    if (!monthArr.includes("all")) {
      // Convert month numbers to integers for comparison
      const monthNums = monthArr
        .map((m) => parseInt(m))
        .filter((m) => !isNaN(m));
      if (monthNums.length > 0) {
        query.whereRaw("EXTRACT(MONTH FROM e.event_date) IN (?)", [monthNums]);
      }
    }

    // Years filter (extract year from event_date)
    const yearArr = paramToArray(years);
    if (!yearArr.includes("all")) {
      // Convert year strings to integers for comparison
      const yearNums = yearArr.map((y) => parseInt(y)).filter((y) => !isNaN(y));
      if (yearNums.length > 0) {
        query.whereRaw("EXTRACT(YEAR FROM e.event_date) IN (?)", [yearNums]);
      }
    }

    // Sorting
    if (sortColumn) {
      // Handle sorting on joined table columns
      if (sortColumn === "event_type") {
        query.orderBy("et.event_type", sortOrder);
      } else {
        query.orderBy(`e.${sortColumn}`, sortOrder);
      }
    } else {
      // Default sort by event_date ascending
      query.orderBy("e.event_date", "asc");
    }

    // Get distinct years from database for filter options
    const availableYearsPromise = knex("events")
      .select(knex.raw("DISTINCT EXTRACT(YEAR FROM event_date) as year"))
      .whereNotNull("event_date")
      .orderBy("year", "desc");

    // Execute queries in parallel
    const [results, yearRows] = await Promise.all([
      query,
      availableYearsPromise,
    ]);

    // Extract years from results
    const availableYears = yearRows
      .map((r) => Math.floor(parseFloat(r.year))) // Ensure integer
      .filter((y) => !isNaN(y))
      .sort((a, b) => b - a); // Sort descending

    const filters = {
      searchColumn,
      searchValue: searchValue || "",
      eventNames: eventNameArr,
      locations: locationArr,
      eventTypes: eventTypeArr,
      months: monthArr,
      years: yearArr,
      sortColumn: sortColumn || "",
      sortOrder,
      availableYears,
    };

    res.render("events", {
      events: results,
      message,
      messageType,
      filters,
    });
  } catch (err) {
    console.error("Error loading events:", err);
    res.render("events", {
      events: [],
      message: "Error loading events",
      messageType: "danger",
      filters: {
        searchColumn: "event_name",
        searchValue: "",
        eventNames: ["all"],
        locations: ["all"],
        eventTypes: ["all"],
        months: ["all"],
        years: ["all"],
        sortColumn: "",
        sortOrder: "asc",
        availableYears: [],
      },
    });
  }
});

// SURVEY MAINTENANCE PAGE: UPDATE ALL LATER
// For surveys: map logical column names (from UI) to real DB columns (with table aliases)
const SURVEY_SEARCHABLE_COLUMNS = [
  "full_name", // NEW
  "participant_first_name",
  "participant_last_name",
  "event_name",
  "event_date",
  "survey_nps_bucket",
];

const SURVEY_COLUMN_MAP = {
  full_name: null, // special-cased in code below
  participant_first_name: "p.participant_first_name",
  participant_last_name: "p.participant_last_name",
  event_name: "e.event_name",
  event_date: "e.event_date",
  survey_nps_bucket: "s.survey_nps_bucket",
};
app.get("/surveys", async (req, res) => {
  try {
    // flash messages
    const sessionData = req.session || {};
    const message = sessionData.flashMessage || "";
    const messageType = sessionData.flashType || "success";
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
    // Default to "full_name" if no searchColumn provided
    if (!searchColumn) {
      searchColumn = "full_name";
    }
    // Validate that the provided searchColumn is in the allowed list
    if (
      searchColumn !== "full_name" &&
      !SURVEY_SEARCHABLE_COLUMNS.includes(searchColumn)
    ) {
      searchColumn = "full_name";
    }

    sortOrder = sortOrder === "desc" ? "desc" : "asc";

    // base query with joins
    // 🔁 if your join table has a different name, update "event_registrations" + its cols
    let query = knex("survey_results as s")
      .join(
        "event_registrations as er",
        "s.event_registration_id",
        "er.event_registration_id"
      )
      .join("participants as p", "er.participant_id", "p.participant_id")
      .join("events as e", "er.event_id", "e.event_id")
      .select(
        "s.survey_id",
        "s.event_registration_id",
        "p.participant_first_name",
        "p.participant_last_name",
        "e.event_name",
        "e.event_date",
        "s.survey_satisfaction_score",
        "s.survey_usefulness_score",
        "s.survey_instructor_score",
        "s.survey_recommendation_score",
        "s.survey_overall_score",
        "s.survey_nps_bucket",
        "s.survey_comments",
        "s.submission_date as survey_submission_date",
        "s.submission_time as survey_submission_time"
      );

    // case-insensitive search (with full_name support)
    if (searchValue) {
      const term = searchValue.trim();
      if (term) {
        if (searchColumn === "full_name") {
          // Handle full name like "Jane", "Doe", or "Jane Doe Smith"
          const parts = term.split(/\s+/);

          if (parts.length === 1) {
            // One word -> match either first OR last name
            const likeOne = `%${parts[0]}%`;
            query.where(function () {
              this.where("p.participant_first_name", "ilike", likeOne).orWhere(
                "p.participant_last_name",
                "ilike",
                likeOne
              );
            });
          } else {
            // Multiple words -> first piece as first name, last piece as last name
            const firstLike = `%${parts[0]}%`;
            const lastLike = `%${parts[parts.length - 1]}%`;

            query.where(function () {
              this.where(
                "p.participant_first_name",
                "ilike",
                firstLike
              ).andWhere("p.participant_last_name", "ilike", lastLike);
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
    if (!eventNameArr.includes("all")) {
      query.whereIn("e.event_name", eventNameArr);
    }

    const satArr = paramToArray(satisfaction);
    if (!satArr.includes("all")) {
      query.whereIn("s.survey_satisfaction_score", satArr.map(Number));
    }

    const usefulArr = paramToArray(usefulness);
    if (!usefulArr.includes("all")) {
      query.whereIn("s.survey_usefulness_score", usefulArr.map(Number));
    }

    const instrArr = paramToArray(instructor);
    if (!instrArr.includes("all")) {
      query.whereIn("s.survey_instructor_score", instrArr.map(Number));
    }

    const recArr = paramToArray(recommendation);
    if (!recArr.includes("all")) {
      query.whereIn("s.survey_recommendation_score", recArr.map(Number));
    }

    const overallArr = paramToArray(overall);
    if (!overallArr.includes("all")) {
      query.whereIn("s.survey_overall_score", overallArr.map(Number));
    }

    const npsArr = paramToArray(nps);
    if (!npsArr.includes("all")) {
      query.whereIn("s.survey_nps_bucket", npsArr);
    }

    // sorting
    if (sortColumn) {
      const sortDbCol = SURVEY_COLUMN_MAP[sortColumn];
      if (sortDbCol) {
        query.orderByRaw(`${sortDbCol} ${sortOrder}`);
      }
    }

    // Build option lists for filters (event names + NPS buckets)
    const eventNameOptionsPromise = knex("events")
      .distinct("event_name")
      .orderBy("event_name");

    const npsOptionsPromise = knex("survey_results")
      .distinct("survey_nps_bucket")
      .whereNotNull("survey_nps_bucket")
      .orderBy("survey_nps_bucket");

    const [eventNameRows, npsRows, results] = await Promise.all([
      eventNameOptionsPromise,
      npsOptionsPromise,
      query,
    ]);

    const eventNameOptions = eventNameRows
      .map((r) => r.event_name)
      .filter(Boolean);
    const npsOptions = npsRows.map((r) => r.survey_nps_bucket).filter(Boolean);

    const filters = {
      searchColumn,
      searchValue: searchValue || "",
      eventNames: eventNameArr,
      satisfaction: satArr,
      usefulness: usefulArr,
      instructor: instrArr,
      recommendation: recArr,
      overall: overallArr,
      nps: npsArr,
      sortColumn: sortColumn || "",
      sortOrder,
      eventNameOptions,
      npsOptions,
    };

    res.render("surveys", {
      survey: results,
      message,
      messageType,
      filters,
    });
  } catch (err) {
    console.error("Error loading surveys:", err);
    res.render("surveys", {
      survey: [],
      message: "Error loading surveys",
      messageType: "danger",
      filters: {
        searchColumn: "participant_first_name",
        searchValue: "",
        eventNames: ["all"],
        satisfaction: ["all"],
        usefulness: ["all"],
        instructor: ["all"],
        recommendation: ["all"],
        overall: ["all"],
        nps: ["all"],
        sortColumn: "",
        sortOrder: "asc",
        eventNameOptions: [],
        npsOptions: [],
      },
    });
  }
});

// MILESTONES MAINTENANCE PAGE:
// MILESTONES MAINTENANCE PAGE:
app.get("/milestones", async (req, res) => {
  try {
    // flash messages + query messages
    const sessionData = req.session || {};
    let message = sessionData.flashMessage || "";
    let messageType = sessionData.flashType || "success";

    sessionData.flashMessage = null;
    sessionData.flashType = null;

    // fallback to query params (for deletes)
    if (!message && req.query.message) {
      message = req.query.message;
      messageType = req.query.messageType || "success";
    }

    // --- filtering/sorting code ---
    let {
      searchColumn,
      searchValue,
      milestoneTitles,
      categories,
      sortColumn,
      sortOrder,
    } = req.query;

    // defaults
    searchColumn = searchColumn || "full_name";
    sortOrder = sortOrder === "desc" ? "desc" : "asc";

    // Base query with join to participants table
    let query = knex("milestones as m")
      .join("participants as p", "m.participant_id", "p.participant_id")
      .select(
        "m.milestone_id",
        "m.participant_id",
        "m.milestone_title",
        "m.milestone_date",
        "m.milestone_category",
        "p.participant_first_name",
        "p.participant_last_name"
      );

    // Case-insensitive search
    if (searchValue && searchColumn) {
      const term = searchValue.trim();
      if (term) {
        if (searchColumn === "full_name") {
          // Handle full name like "Jane", "Doe", or "Jane Doe Smith"
          const parts = term.split(/\s+/);

          if (parts.length === 1) {
            // One word -> match either first OR last name
            const likeOne = `%${parts[0]}%`;
            query.where(function () {
              this.where("p.participant_first_name", "ilike", likeOne).orWhere(
                "p.participant_last_name",
                "ilike",
                likeOne
              );
            });
          } else {
            // Multiple words -> first piece as first name, last piece as last name
            const firstLike = `%${parts[0]}%`;
            const lastLike = `%${parts[parts.length - 1]}%`;

            query.where(function () {
              this.where(
                "p.participant_first_name",
                "ilike",
                firstLike
              ).andWhere("p.participant_last_name", "ilike", lastLike);
            });
          }
        } else if (searchColumn === "participant_first_name") {
          query.whereRaw(`CAST(p.participant_first_name AS TEXT) ILIKE ?`, [
            `%${term}%`,
          ]);
        } else if (searchColumn === "participant_last_name") {
          query.whereRaw(`CAST(p.participant_last_name AS TEXT) ILIKE ?`, [
            `%${term}%`,
          ]);
        } else if (searchColumn === "milestone_title") {
          query.whereRaw(`CAST(m.milestone_title AS TEXT) ILIKE ?`, [
            `%${term}%`,
          ]);
        } else if (searchColumn === "milestone_category") {
          query.whereRaw(`CAST(m.milestone_category AS TEXT) ILIKE ?`, [
            `%${term}%`,
          ]);
        } else if (searchColumn === "milestone_date") {
          query.whereRaw(`CAST(m.milestone_date AS TEXT) ILIKE ?`, [
            `%${term}%`,
          ]);
        }
      }
    }

    // Milestone Titles filter
    const milestoneTitleArr = paramToArray(milestoneTitles);
    if (!milestoneTitleArr.includes("all")) {
      query.whereIn("m.milestone_title", milestoneTitleArr);
    }

    // Categories filter
    const categoryArr = paramToArray(categories);
    if (!categoryArr.includes("all")) {
      query.whereIn("m.milestone_category", categoryArr);
    }

    // Sorting
    if (sortColumn) {
      // Handle sorting on joined table columns
      if (
        sortColumn === "participant_first_name" ||
        sortColumn === "participant_last_name"
      ) {
        query.orderBy(`p.${sortColumn}`, sortOrder);
      } else {
        query.orderBy(`m.${sortColumn}`, sortOrder);
      }
    } else {
      // Default sort by milestone_date descending
      query.orderBy("m.milestone_date", "desc");
    }

    // Get distinct milestone titles from database for filter options
    const milestoneTitleOptionsPromise = knex("milestones")
      .select("milestone_title")
      .distinct("milestone_title")
      .whereNotNull("milestone_title")
      .orderBy("milestone_title", "asc");

    // Execute queries in parallel
    const [results, milestoneTitleRows] = await Promise.all([
      query,
      milestoneTitleOptionsPromise,
    ]);

    // Extract milestone titles from results
    const milestoneTitleOptions = milestoneTitleRows
      .map((r) => r.milestone_title)
      .filter((t) => t && t.trim() !== "");

    const filters = {
      searchColumn,
      searchValue: searchValue || "",
      milestoneTitles: milestoneTitleArr,
      categories: categoryArr,
      sortColumn: sortColumn || "",
      sortOrder,
      milestoneTitleOptions,
    };

    res.render("milestones", {
      milestones: results,
      message,
      messageType,
      filters,
    });
  } catch (err) {
    console.error("Error loading milestones:", err);
    res.render("milestones", {
      milestones: [],
      message: "Error loading milestones",
      messageType: "danger",
      filters: {
        searchColumn: "full_name",
        searchValue: "",
        milestoneTitles: ["all"],
        categories: ["all"],
        sortColumn: "",
        sortOrder: "asc",
        milestoneTitleOptions: [],
      },
    });
  }
});

// DONATIONS MAINTENANCE PAGE:
app.get("/donations", async (req, res) => {
  try {
    // flash messages + query messages
    const sessionData = req.session || {};
    let message = sessionData.flashMessage || "";
    let messageType = sessionData.flashType || "success";

    sessionData.flashMessage = null;
    sessionData.flashType = null;

    // fallback to query params (for deletes)
    if (!message && req.query.message) {
      message = req.query.message;
      messageType = req.query.messageType || "success";
    }

    // --- filtering/sorting code ---
    let { searchColumn, searchValue, months, years, sortColumn, sortOrder } =
      req.query;

    // defaults
    searchColumn = searchColumn || "full_name";
    sortOrder = sortOrder === "desc" ? "desc" : "asc";

    // Base query with join to participants table
    let query = knex("donations as d")
      .join("participants as p", "d.participant_id", "p.participant_id")
      .select(
        "d.donation_id",
        "d.participant_id",
        "d.donation_date",
        "d.donation_amount",
        "p.participant_first_name",
        "p.participant_last_name"
      );

    // Case-insensitive search
    if (searchValue && searchColumn) {
      const term = searchValue.trim();
      if (term) {
        if (searchColumn === "full_name") {
          // Handle full name like "Jane", "Doe", or "Jane Doe Smith"
          const parts = term.split(/\s+/);

          if (parts.length === 1) {
            // One word -> match either first OR last name
            const likeOne = `%${parts[0]}%`;
            query.where(function () {
              this.where("p.participant_first_name", "ilike", likeOne).orWhere(
                "p.participant_last_name",
                "ilike",
                likeOne
              );
            });
          } else {
            // Multiple words -> first piece as first name, last piece as last name
            const firstLike = `%${parts[0]}%`;
            const lastLike = `%${parts[parts.length - 1]}%`;

            query.where(function () {
              this.where(
                "p.participant_first_name",
                "ilike",
                firstLike
              ).andWhere("p.participant_last_name", "ilike", lastLike);
            });
          }
        } else if (searchColumn === "participant_first_name") {
          query.whereRaw(`CAST(p.participant_first_name AS TEXT) ILIKE ?`, [
            `%${term}%`,
          ]);
        } else if (searchColumn === "participant_last_name") {
          query.whereRaw(`CAST(p.participant_last_name AS TEXT) ILIKE ?`, [
            `%${term}%`,
          ]);
        } else if (searchColumn === "donation_date") {
          query.whereRaw(`CAST(d.donation_date AS TEXT) ILIKE ?`, [
            `%${term}%`,
          ]);
        } else if (searchColumn === "donation_amount") {
          query.whereRaw(`CAST(d.donation_amount AS TEXT) ILIKE ?`, [
            `%${term}%`,
          ]);
        }
      }
    }

    // Months filter (extract month from donation_date)
    const monthArr = paramToArray(months);
    if (!monthArr.includes("all")) {
      const monthNums = monthArr
        .map((m) => parseInt(m))
        .filter((m) => !isNaN(m));
      if (monthNums.length > 0) {
        query.whereRaw("EXTRACT(MONTH FROM d.donation_date) IN (?)", [
          monthNums,
        ]);
      }
    }

    // Years filter (extract year from donation_date)
    const yearArr = paramToArray(years);
    if (!yearArr.includes("all")) {
      const yearNums = yearArr.map((y) => parseInt(y)).filter((y) => !isNaN(y));
      if (yearNums.length > 0) {
        query.whereRaw("EXTRACT(YEAR FROM d.donation_date) IN (?)", [yearNums]);
      }
    }

    // Sorting
    if (sortColumn) {
      if (
        sortColumn === "participant_first_name" ||
        sortColumn === "participant_last_name"
      ) {
        query.orderBy(`p.${sortColumn}`, sortOrder);
      } else {
        query.orderBy(`d.${sortColumn}`, sortOrder);
      }
    } else {
      // Default sort by donation_date descending
      query.orderBy("d.donation_date", "desc");
    }

    // Get distinct years from database for filter options
    const availableYearsPromise = knex("donations")
      .select(knex.raw("DISTINCT EXTRACT(YEAR FROM donation_date) as year"))
      .whereNotNull("donation_date")
      .orderBy("year", "desc");

    // Execute queries in parallel
    const [results, yearRows] = await Promise.all([
      query,
      availableYearsPromise,
    ]);

    // Extract years from results
    const availableYears = yearRows
      .map((r) => Math.floor(parseFloat(r.year)))
      .filter((y) => !isNaN(y))
      .sort((a, b) => b - a);

    const filters = {
      searchColumn,
      searchValue: searchValue || "",
      months: monthArr,
      years: yearArr,
      sortColumn: sortColumn || "",
      sortOrder,
      availableYears,
    };

    res.render("donations", {
      donations: results,
      message,
      messageType,
      filters,
    });
  } catch (err) {
    console.error("Error loading donations:", err);
    res.render("donations", {
      donations: [],
      message: "Error loading donations",
      messageType: "danger",
      filters: {
        searchColumn: "full_name",
        searchValue: "",
        months: ["all"],
        years: ["all"],
        sortColumn: "",
        sortOrder: "asc",
        availableYears: [],
      },
    });
  }
});

/* ADD/EDIT/DELETE FUNCTIONALITY */
// ADD ENTRY PAGE:
// Route that will display a completely empty form to "Add entry" (called from the database pages)
app.get("/add/:table", async (req, res) => {
  const table_name = req.params.table;

  let events = [];
  let event_types = [];

  // Load event types *only* for the events form
  if (table_name === "events") {
    event_types = await knex("event_types")
      .select("event_type_id", "event_name")
      .orderBy("event_name");
  }

  // Load actual events for survey + event_registrations + events pages
  if (
    table_name === "survey_results" ||
    table_name === "event_registrations" ||
    table_name === "events"
  ) {
    events = await knex("events")
      .select(
        "event_id",
        "event_name",
        "event_date",
        "event_start_time",
        "event_end_time"
      )
      .orderBy(["event_name", "event_date", "event_start_time"]);
  }

  res.render("add", { table_name, events, event_types, pass_id: null });
});

// Route that will display an "Add entry" form with user id filled out (called from the profile pages)
app.get("/add/:table/:id", async (req, res) => {
  const table_name = req.params.table;
  const pass_id = req.params.id;

  let events = [];
  let event_types = [];

  // Event types for Events form
  if (table_name === "events") {
    event_types = await knex("event_types")
      .select("event_type_id", "event_name")
      .orderBy("event_name");
  }

  // Events list for dropdowns
  if (
    table_name === "survey_results" ||
    table_name === "event_registrations" ||
    table_name === "events"
  ) {
    events = await knex("events")
      .select(
        "event_id",
        "event_name",
        "event_date",
        "event_start_time",
        "event_end_time"
      )
      .orderBy(["event_name", "event_date", "event_start_time"]);
  }

  res.render("add", { table_name, events, event_types, pass_id });
});

// Route that adds the form inputs to the databases
app.post("/add/:table", async (req, res) => {
  const table_name = req.params.table;
  const newData = req.body;

  try {
    await knex(table_name).insert(newData);

    // Set flash message in session
    req.session.flashMessage = "Added Successfully!";
    req.session.flashType = "success";

    // Redirect without passing options object
    // Special case: survey_results should redirect to /surveys
    if (table_name === "survey_results") {
      res.redirect("/surveys");
    } else if (table_name === "event_registrations") {
      res.redirect("/event_registrations");
    } else {
      res.redirect(`/${table_name}`);
    }
  } catch (err) {
    console.log("Error adding record:", err.message);

    // Set error flash message
    req.session.flashMessage = "Error adding record: " + err.message;
    req.session.flashType = "danger";

    // Special case: survey_results should redirect to /surveys
    if (table_name === "survey_results") {
      res.redirect("/surveys");
    } else if (table_name === "event_registrations") {
      res.redirect("/event_registrations");
    } else {
      res.redirect(`/${table_name}`);
    }
  }
});

// DELETE FUNCTIONALITY:
// route that occurs when delete button is pressed
app.post("/delete/:table/:id", async (req, res) => {
  const { table, id } = req.params;

  const primaryKeyByTable = {
    participants: "participant_id",
    milestones: "milestone_id",
    events: "event_id",
    survey_results: "survey_id",
    donations: "donation_id",
    event_registrations: "event_registration_id",
  };

  const primaryKey = primaryKeyByTable[table];

  try {
    await knex(table).where(primaryKey, id).del();
    res.status(200).json({ success: true });
  } catch (err) {
    console.log("Error deleting record:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// EDIT FUNCTIONALITY
// route to display the "edit ____" page
app.get("/edit/:table/:id", async (req, res) => {
  const table_name = req.params.table;
  const id = req.params.id;

  const primaryKeyByTable = {
    participants: "participant_id",
    milestones: "milestone_id",
    events: "event_id",
    survey_results: "survey_id",
    donations: "donation_id",
    event_registrations: "event_registration_id",
  };

  const primaryKey = primaryKeyByTable[table_name];

  try {
    let info;

    // Special handling for survey_results - need to join to get event info
    if (table_name === "survey_results") {
      info = await knex("survey_results as s")
        .join(
          "event_registrations as er",
          "s.event_registration_id",
          "er.event_registration_id"
        )
        .join("events as e", "er.event_id", "e.event_id")
        .join("participants as p", "er.participant_id", "p.participant_id")
        .where("s.survey_id", id)
        .select(
          "s.*",
          "e.event_id",
          "e.event_name",
          "e.event_date",
          "p.participant_id"
        )
        .first();
    } else {
      info = await knex(table_name).where(primaryKey, id).first();
    }

    let events = [];
    let event_types = [];

    if (table_name === "events") {
      event_types = await knex("event_types")
        .select("event_type_id", "event_type_name")
        .orderBy("event_type_name");
    }

    if (
      table_name === "event_registrations" ||
      table_name === "survey_results" ||
      table_name === "events"
    ) {
      events = await knex("events")
        .select(
          "event_id",
          "event_name",
          "event_date",
          "event_start_time",
          "event_end_time"
        )
        .orderBy(["event_name", "event_date", "event_start_time"]);
    }

    res.render("edit", { table_name, info, id, events, event_types });
  } catch (err) {
    console.error("Error fetching entry:", err.message);
    // Special case: survey_results should redirect to /surveys
    const redirectPath =
      table_name === "survey_results"
        ? "/surveys"
        : table_name === "event_registrations"
        ? "/event_registrations"
        : `/${table_name}`;
    res.redirect(redirectPath);
  }
});

// Route that updates the "entry" to the databases
app.post("/edit/:table/:id", async (req, res) => {
  const table_name = req.params.table;
  const id = req.params.id;
  const updatedData = req.body;

  const primaryKeyByTable = {
    participants: "participant_id",
    milestones: "milestone_id",
    events: "event_id",
    survey_results: "survey_id",
    donations: "donation_id",
    event_registrations: "event_registration_id",
  };

  const primaryKey = primaryKeyByTable[table_name];

  try {
    await knex(table_name).where(primaryKey, id).update(updatedData);

    req.session.flashMessage = "Updated Successfully!";
    req.session.flashType = "success";

    // Special case: survey_results should redirect to /surveys
    const redirectPath =
      table_name === "survey_results"
        ? "/surveys"
        : table_name === "event_registrations"
        ? "/event_registrations"
        : `/${table_name}`;
    res.redirect(redirectPath);
  } catch (err) {
    console.log("Error updating record:", err.message);
    req.session.flashMessage = "Error updating record: " + err.message;
    req.session.flashType = "danger";

    const redirectPath =
      table_name === "survey_results"
        ? "/surveys"
        : table_name === "event_registrations"
        ? "/event_registrations"
        : `/${table_name}`;
    res.redirect(redirectPath);
  }
});

// EVENT REGISTRATIONS MAINTENANCE PAGE:
app.get("/event_registrations", async (req, res) => {
  try {
    // flash messages + query messages
    const sessionData = req.session || {};
    let message = sessionData.flashMessage || "";
    let messageType = sessionData.flashType || "success";

    sessionData.flashMessage = null;
    sessionData.flashType = null;

    // fallback to query params (for deletes)
    if (!message && req.query.message) {
      message = req.query.message;
      messageType = req.query.messageType || "success";
    }

    // --- filtering/sorting code ---
    let {
      searchColumn,
      searchValue,
      eventNames,
      months,
      years,
      registrationStatus,
      registrationAttendedFlag,
      sortColumn,
      sortOrder,
    } = req.query;

    // defaults
    searchColumn = searchColumn || "full_name";
    sortOrder = sortOrder === "desc" ? "desc" : "asc";

    // Base query with joins
    let query = knex("event_registrations as er")
      .join("participants as p", "er.participant_id", "p.participant_id")
      .join("events as e", "er.event_id", "e.event_id")
      .select(
        "er.event_registration_id",
        "er.participant_id",
        "er.event_id",
        "er.registration_status",
        "er.registration_attended_flag",
        "er.registration_created_at_date",
        "er.registration_created_at_time",
        "er.registration_check_in_date",
        "er.registration_check_in_time",
        "p.participant_first_name",
        "p.participant_last_name",
        "e.event_name",
        "e.event_date"
      );

    // Case-insensitive search
    if (searchValue && searchColumn) {
      const term = searchValue.trim();
      if (term) {
        if (searchColumn === "full_name") {
          // Handle full name like "Jane", "Doe", or "Jane Doe Smith"
          const parts = term.split(/\s+/);

          if (parts.length === 1) {
            // One word -> match either first OR last name
            const likeOne = `%${parts[0]}%`;
            query.where(function () {
              this.where("p.participant_first_name", "ilike", likeOne).orWhere(
                "p.participant_last_name",
                "ilike",
                likeOne
              );
            });
          } else {
            // Multiple words -> first piece as first name, last piece as last name
            const firstLike = `%${parts[0]}%`;
            const lastLike = `%${parts[parts.length - 1]}%`;

            query.where(function () {
              this.where(
                "p.participant_first_name",
                "ilike",
                firstLike
              ).andWhere("p.participant_last_name", "ilike", lastLike);
            });
          }
        } else if (searchColumn === "participant_first_name") {
          query.whereRaw(`CAST(p.participant_first_name AS TEXT) ILIKE ?`, [
            `%${term}%`,
          ]);
        } else if (searchColumn === "participant_last_name") {
          query.whereRaw(`CAST(p.participant_last_name AS TEXT) ILIKE ?`, [
            `%${term}%`,
          ]);
        } else if (searchColumn === "event_name") {
          query.whereRaw(`CAST(e.event_name AS TEXT) ILIKE ?`, [`%${term}%`]);
        }
      }
    }

    // Event Names filter
    const eventNameArr = paramToArray(eventNames);
    if (!eventNameArr.includes("all")) {
      query.whereIn("e.event_name", eventNameArr);
    }

    // Months filter (extract month from event_date)
    const monthArr = paramToArray(months);
    if (!monthArr.includes("all")) {
      const monthNums = monthArr
        .map((m) => parseInt(m))
        .filter((m) => !isNaN(m));
      if (monthNums.length > 0) {
        query.whereRaw("EXTRACT(MONTH FROM e.event_date) IN (?)", [monthNums]);
      }
    }

    // Years filter (extract year from event_date)
    const yearArr = paramToArray(years);
    if (!yearArr.includes("all")) {
      const yearNums = yearArr.map((y) => parseInt(y)).filter((y) => !isNaN(y));
      if (yearNums.length > 0) {
        query.whereRaw("EXTRACT(YEAR FROM e.event_date) IN (?)", [yearNums]);
      }
    }

    // Registration Status filter
    const statusArr = paramToArray(registrationStatus);
    if (!statusArr.includes("all")) {
      query.whereIn("er.registration_status", statusArr);
    }

    // Registration Attended Flag filter
    const attendedArr = paramToArray(registrationAttendedFlag);
    if (!attendedArr.includes("all")) {
      const flagNums = attendedArr
        .map((f) => parseInt(f))
        .filter((f) => !isNaN(f));
      if (flagNums.length > 0) {
        query.whereIn("er.registration_attended_flag", flagNums);
      }
    }

    // Sorting
    if (sortColumn) {
      if (
        sortColumn === "participant_first_name" ||
        sortColumn === "participant_last_name"
      ) {
        query.orderBy(`p.${sortColumn}`, sortOrder);
      } else if (sortColumn === "event_name" || sortColumn === "event_date") {
        query.orderBy(`e.${sortColumn}`, sortOrder);
      } else {
        query.orderBy(`er.${sortColumn}`, sortOrder);
      }
    } else {
      // Default sort by event_date descending
      query.orderBy("e.event_date", "desc");
    }

    // Get distinct years and event names for filter options
    const availableYearsPromise = knex("events")
      .select(knex.raw("DISTINCT EXTRACT(YEAR FROM event_date) as year"))
      .whereNotNull("event_date")
      .orderBy("year", "desc");

    const eventNameOptionsPromise = knex("events")
      .distinct("event_name")
      .orderBy("event_name");

    // Execute queries in parallel
    const [results, yearRows, eventNameRows] = await Promise.all([
      query,
      availableYearsPromise,
      eventNameOptionsPromise,
    ]);

    // Extract years from results
    const availableYears = yearRows
      .map((r) => Math.floor(parseFloat(r.year)))
      .filter((y) => !isNaN(y))
      .sort((a, b) => b - a);

    const eventNameOptions = eventNameRows
      .map((r) => r.event_name)
      .filter(Boolean);

    const filters = {
      searchColumn,
      searchValue: searchValue || "",
      eventNames: eventNameArr,
      months: monthArr,
      years: yearArr,
      registrationStatus: statusArr,
      registrationAttendedFlag: attendedArr,
      sortColumn: sortColumn || "",
      sortOrder,
      availableYears,
      eventNameOptions,
    };

    res.render("event_registrations", {
      eventRegistrations: results,
      message,
      messageType,
      filters,
    });
  } catch (err) {
    console.error("Error loading event registrations:", err);
    res.render("event_registrations", {
      eventRegistrations: [],
      message: "Error loading event registrations",
      messageType: "danger",
      filters: {
        searchColumn: "full_name",
        searchValue: "",
        eventNames: ["all"],
        months: ["all"],
        years: ["all"],
        registrationStatus: ["all"],
        registrationAttendedFlag: ["all"],
        sortColumn: "",
        sortOrder: "asc",
        availableYears: [],
        eventNameOptions: [],
      },
    });
  }
});

// START TO LISTEN (& tell command line)
app.listen(port, () => console.log("the server has started to listen"));
