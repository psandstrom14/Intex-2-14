// index.js
// Paris Ward, Lucas Moraes, Joshua Ethington, Parker Sandstrom
// This is the main server file for the Ella Rises nonprofit management system.
// It handles all the routes, database connections, authentication, and connects everything together.

// ============================================================================
// SETTING UP THE FOUNDATION - Libraries and Database Connection
// ============================================================================

// Load environment variables from .env file - this keeps sensitive info like database passwords safe
require("dotenv").config();

// Express is our web framework - it handles all the HTTP requests and responses
const express = require("express");

// Sessions let us remember who's logged in across different page visits
// When someone logs in, we store their info here so they don't have to log in again
const session = require("express-session");

// Path helps us safely work with file/folder locations across different operating systems
let path = require("path");

// Body parser helps us read data from forms and JSON requests
let bodyParser = require("body-parser");

// Knex connects us to our PostgreSQL database
// This is where all our data lives - users, events, donations, milestones, etc.
const knex = require("knex")({
  client: "pg", // PostgreSQL database
  connection: {
    // Connect to our AWS RDS database (or use local defaults for development)
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

// ============================================================================
// INITIALIZING THE APP - Setting up Express and Middleware
// ============================================================================

// Create our Express app - this is the main object that handles everything
let app = express();

// Set the port we'll listen on (defaults to 3000 if not set in environment)
const port = process.env.PORT || 3000;

// Tell Express to use EJS templates - all our .ejs files in the views folder will be rendered here
app.set("view engine", "ejs");

// Make the images folder accessible via /images URL path
// So when we reference /images/logo.png in our templates, it finds it
app.use("/images", express.static(path.join(__dirname, "images")));

// Make the public folder accessible (CSS, JavaScript, etc.)
app.use(express.static("public"));

// Set up session storage - this remembers who's logged in
app.use(
  session({
    secret: process.env.SESSION_SECRET || "intex-secret-key",
    resave: false,
    saveUninitialized: false,
  })
);

// Middleware to parse form data - when someone submits a form, this makes it easy to read
app.use(express.urlencoded({ extended: true }));

// Middleware to parse JSON data - for AJAX requests and API calls
app.use(express.json());

// ============================================================================
// HELPER FUNCTIONS - Utilities used throughout the app
// ============================================================================

// Helper function for filters - converts single values or arrays into consistent array format
// Used in all our database pages (users, events, donations, etc.) for filtering
function paramToArray(val, defaultVal = ["all"]) {
  if (!val) return defaultVal;
  return Array.isArray(val) ? val : [val];
}

// Helper to get current date/time in the format our database expects
// Used when creating new records that need timestamps
const nowDate = () => {
  const d = new Date();
  const iso = d.toISOString();
  return {
    date: iso.slice(0, 10),
    time: iso.slice(11, 19),
  };
};

// ============================================================================
// MIDDLEWARE - Code that runs on every request
// ============================================================================

// Language middleware - remembers what language the user selected
// This gets passed to all our EJS templates so they can show the right language
app.use((req, res, next) => {
  res.locals.language = req.session.language || "en";
  next();
});

// Login status middleware - makes login info available to all templates
// Every EJS file can check isLoggedIn, role, userId, etc. without us having to pass it manually
app.use((req, res, next) => {
  res.locals.isLoggedIn = req.session.isLoggedIn || false;
  res.locals.role = req.session.user?.role || null;
  res.locals.userId = req.session.user?.id || null;
  res.locals.username = req.session.user?.username || null;
  next();
});

// Global authentication middleware - runs on EVERY request
// This is our security guard - it checks if someone is logged in before letting them access protected pages
app.use((req, res, next) => {
  // These are public routes that anyone can access without logging in
  if (
    req.path === "/" ||
    req.path === "/index" ||
    req.path === "/about" ||
    req.path === "/performance" ||
    req.path === "/calendar" ||
    req.path === "/login" ||
    req.path === "/logout" ||
    req.path === "/signup" ||
    req.path === "/set-language" ||
    req.path === "/teapot"
  ) {
    return next(); // Let them through, no login needed
  }

  // For all other routes, check if they're logged in
  if (req.session.isLoggedIn) {
    next(); // They're logged in, let them through
  } else {
    // Not logged in - save where they wanted to go, then send them to login
    // After they log in, we'll redirect them back to where they were trying to go
    req.session.returnTo = req.originalUrl || req.url;
    res.render("login", { error_message: "Please log in to access this page" });
  }
});

// ============================================================================
// AUTHORIZATION HELPERS - Who can access what
// ============================================================================

// Middleware for admin-only routes - use this on routes that only admins should see
// Like the /users, /events, /donations pages where admins manage all the data
const requireAdmin = (req, res, next) => {
  if (!req.session.isLoggedIn) {
    req.session.returnTo = req.originalUrl || req.url;
    return res.render("login", {
      error_message: "Please log in to access this page",
    });
  }

  if (req.session.user?.role?.toLowerCase() !== "admin") {
    return res.status(403).send("Access denied. Admin privileges required.");
  }

  next();
};

// Helper for routes where users can access their own stuff OR admins can access anything
// Used in profile pages - you can see your own profile, admins can see anyone's
const requireSelfOrAdmin = (req, res, targetUserId) => {
  if (!req.session.isLoggedIn) {
    req.session.returnTo = req.originalUrl || req.url;
    res.render("login", { error_message: "Please log in to access this page" });
    return false;
  }

  const role = req.session.user?.role?.toLowerCase();
  const sessionUserId = req.session.user?.id;

  // If you're not an admin AND you're not viewing your own stuff, deny access
  if (role !== "admin" && sessionUserId !== targetUserId) {
    res.status(403).send("Access denied. Admin or owner privileges required.");
    return false;
  }

  return true;
};

// ============================================================================
// AUTHENTICATION ROUTES - Login, Signup, Logout
// ============================================================================

// Show the login page - this is what users see when they need to log in
app.get("/login", (req, res) => {
  res.status(418); // Easter egg status code (I'm a teapot)
  res.render("login");
});

// Handle login form submission - when someone enters their username/password
app.post("/login", (req, res) => {
  let username = req.body.username;
  let password = req.body.password;

  // Look up the user in the database
  knex
    .select()
    .from("users")
    .where({ participant_username: username, participant_password: password })
    .first()
    .then((user) => {
      if (user) {
        // Found them! Store their info in the session so we remember they're logged in
        req.session.user = {
          id: user.user_id,
          username: user.participant_username,
          role: user.participant_role,
        };
        req.session.isLoggedIn = true;

        // If they were trying to access a page before logging in, send them there
        // Otherwise, send them to their profile page
        const returnTo = req.session.returnTo || `/profile/${user.user_id}`;
        delete req.session.returnTo; // Clean up
        res.redirect(returnTo);
      } else {
        // Wrong username/password - show error
        res.render("login", { error_message: "Invalid credentials" });
      }
    })
    .catch((err) => {
      console.error(err);
      res.render("login", { error_message: "Database error" });
    });
});

// Logout route - clears the session and sends them back to home
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

// Show the signup page - where new users create accounts
app.get("/signup", (req, res) => {
  res.render("signup");
});

// Handle signup form submission - create new user account
app.post("/signup", async (req, res) => {
  try {
    const newData = req.body;

    // Insert the new user into the database and get their info back
    const [user] = await knex("users").insert(newData).returning("*");

    // Automatically log them in after signup (better user experience)
    req.session.user = {
      id: user.user_id,
      username: user.participant_username,
      role: user.participant_role,
    };
    req.session.isLoggedIn = true;

    // Send them to their new profile page
    res.redirect(`/profile/${user.user_id}`);
  } catch (err) {
    console.log("Error signing up", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// LANGUAGE SETTINGS - Multi-language support
// ============================================================================

// Handle language selection from the footer dropdown
// This gets called when someone picks a language, and we save it to their session
app.post("/set-language", (req, res) => {
  const { lang } = req.body;

  // Only allow languages we actually support (security check)
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

  // Save their language preference to the session
  req.session.language = lang;
  res.json({ success: true });
});

// ============================================================================
// PUBLIC ROUTES - Pages anyone can visit
// ============================================================================

// Home page - the main landing page that introduces Ella Rises
// Shows programs, impact stats, and calls to action
app.get("/", (req, res) => {
  res.render("index");
});

// About page - tells the story of Ella Rises, mission, and founder's message
// Includes an embedded video explaining the organization
app.get("/about", (req, res) => {
  res.render("about");
});

// Performance page - shows analytics and impact data (if implemented)
app.get("/performance", (req, res) => {
  res.render("performance");
});

// Calendar page - shows upcoming events in a calendar view
// Anyone can see events, but logged-in users can register for them
// This is one of the most complex pages - it builds a 3-month calendar view
app.get("/calendar", async (req, res) => {
  // Helper function to convert 24-hour time (like "14:30:00") to 12-hour format ("2:30 PM")
  // The database stores times in 24-hour format, but users expect to see 12-hour format
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

  try {
    // Get any flash messages (success/error messages from previous actions)
    // These get displayed at the top of the calendar page
    const sessionData = req.session || {};
    const message = sessionData.flashMessage || "";
    const messageType = sessionData.flashType || "success";
    sessionData.flashMessage = null;
    sessionData.flashType = null;

    // If user is logged in, figure out which events they're already registered for
    // This lets us highlight those events differently in the calendar
    let userRegisteredEventIds = [];
    if (req.session.user && req.session.user.id) {
      const userRegistrations = await knex("event_registrations")
        .where("user_id", req.session.user.id)
        .whereIn("registration_status", ["registered", "attended"])
        .select("event_id");

      userRegisteredEventIds = userRegistrations.map((reg) => reg.event_id);
    }

    // Calculate the date range - we're showing the next 3 months
    const today = new Date();
    const endDate = new Date(today);
    endDate.setMonth(endDate.getMonth() + 3);

    // Format dates for SQL query (database expects YYYY-MM-DD format)
    const startDateStr = today.toISOString().split("T")[0];
    const endDateStr = endDate.toISOString().split("T")[0];

    // Get all events happening in the next 3 months from the database
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

    // For each event, count how many people have registered
    // This helps us show if events are full and helps users decide what to register for
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

        // Check if the current user is registered for this event
        const isUserRegistered = userRegisteredEventIds.includes(
          event.event_id
        );

        // Return the event with registration info attached
        return {
          ...event,
          registered_count: parseInt(registrationCount.count) || 0,
          user_registered: isUserRegistered,
        };
      })
    );

    // Now build the calendar structure - we need to organize events by month and day
    // This is what the EJS template uses to render the calendar grid
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

    // Build data for each of the 3 months we're displaying
    for (let i = 0; i < 3; i++) {
      const monthDate = new Date(today.getFullYear(), today.getMonth() + i, 1);
      const year = monthDate.getFullYear();
      const monthNum = monthDate.getMonth() + 1;
      const monthName = monthNames[monthDate.getMonth()];

      // Figure out what day of the week the month starts on (needed for calendar grid)
      // 0 = Sunday, 6 = Saturday
      const startDay = monthDate.getDay();

      // How many days are in this month?
      const daysInMonth = new Date(year, monthNum, 0).getDate();

      // Organize events by date - create an object where keys are dates like "2025-01-15"
      const monthEvents = {};
      eventsWithCounts.forEach((event) => {
        const eventDate = new Date(event.event_date);
        // Only include events that fall in this specific month
        if (
          eventDate.getMonth() === monthDate.getMonth() &&
          eventDate.getFullYear() === year
        ) {
          // Convert event_date to YYYY-MM-DD string for the key
          const dateKey = eventDate.toISOString().split("T")[0];
          if (!monthEvents[dateKey]) {
            monthEvents[dateKey] = [];
          }

          // Format the event data for display (convert times, etc.)
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

      // Add this month's data to our months array
      months.push({
        name: monthName,
        year: year,
        monthNum: monthNum,
        startDay: startDay,
        daysInMonth: daysInMonth,
        events: monthEvents,
      });
    }

    // Get today's date string so we can highlight today in the calendar
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

// ============================================================================
// EVENT REGISTRATION ROUTES - Users registering for events from calendar
// ============================================================================

// Handle event registration - when someone clicks "Register" on an event in the calendar
// This gets called via AJAX from the calendar page, so it returns JSON instead of rendering a page
app.post("/register-event/:eventId", async (req, res) => {
  const eventId = req.params.eventId;

  try {
    // Make sure they're logged in (can't register without an account)
    if (!req.session.user || !req.session.user.id) {
      return res.status(401).json({
        success: false,
        message: "You must be logged in to register",
        redirect: "/login",
      });
    }

    // Get the event details from the database
    const event = await knex("events").where("event_id", eventId).first();

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    // Count how many people have already registered (to check if event is full)
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

    // Don't let them register if the event is already full
    if (seatsLeft <= 0) {
      return res.status(400).json({
        success: false,
        message: "Sorry, this event is full.",
      });
    }

    // Check if they're already registered (prevent duplicate registrations)
    const existingRegistration = await knex("event_registrations")
      .where("event_id", eventId)
      .where("user_id", req.session.user.id)
      .first();

    if (existingRegistration) {
      return res.status(400).json({
        success: false,
        message: "You are already registered for this event.",
      });
    }

    // Everything checks out - create the registration record
    await knex("event_registrations").insert({
      user_id: req.session.user.id,
      event_id: eventId,
      registration_status: "registered",
      registration_attended_flag: 0, // They haven't attended yet, just registered
      registration_created_at_date: new Date().toISOString().split("T")[0],
      registration_created_at_time: new Date().toTimeString().split(" ")[0],
    });

    // Format dates for Google Calendar integration
    // The calendar page lets users add events to their Google Calendar, so we need this format
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

    // Send back success with event details (frontend uses this to show success message)
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

// Handle cancellation - when someone cancels their event registration
app.post("/cancel-registration/:eventId", async (req, res) => {
  const eventId = req.params.eventId;

  try {
    // Make sure they're logged in
    if (!req.session.user || !req.session.user.id) {
      return res.status(401).json({
        success: false,
        message: "You must be logged in to cancel registration",
        redirect: "/login",
      });
    }

    // Get the event details
    const event = await knex("events").where("event_id", eventId).first();

    if (!event) {
      return res.status(404).json({
        success: false,
        message: "Event not found",
      });
    }

    // Find their registration record
    const existingRegistration = await knex("event_registrations")
      .where("event_id", eventId)
      .where("user_id", req.session.user.id)
      .whereIn("registration_status", ["registered", "attended"])
      .first();

    // Can't cancel if they're not registered
    if (!existingRegistration) {
      return res.status(400).json({
        success: false,
        message: "You are not registered for this event.",
      });
    }

    // Update their registration status to 'cancelled' (don't delete it, just mark as cancelled)
    await knex("event_registrations")
      .where(
        "event_registration_id",
        existingRegistration.event_registration_id
      )
      .update({
        registration_status: "cancelled",
      });

    // Send back success
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

// ============================================================================
// DONATION ROUTES - Handling donations
// ============================================================================

// Show the donation page - where users can make donations
app.get("/donate_now", (req, res) => {
  res.render("donate_now");
});

// Handle donation form submission - saves donation to database
// This route handles both AJAX requests (from the donate_now page) and regular form submissions
app.post("/add/donations", async (req, res) => {
  const newData = req.body;

  console.log("Donation submission received:", newData);

  // Figure out if this is an AJAX request (from donate_now page) or regular form submission
  // The donate_now page uses AJAX so it can show a thank you message without reloading
  const isAjaxRequest =
    req.headers["content-type"]?.includes("application/json") ||
    req.xhr ||
    (req.headers.accept?.includes("application/json") &&
      !req.headers.accept?.includes("text/html")) ||
    req.headers.accept === "*/*";

  try {
    // Make sure all required fields are filled in
    if (
      !newData.user_id ||
      !newData.donation_date ||
      !newData.donation_amount
    ) {
      if (isAjaxRequest) {
        return res.json({
          success: false,
          error: "Missing required fields",
        });
      }
      // Regular form submission - redirect with error message
      req.session.flashMessage = "Error: Missing required fields";
      req.session.flashType = "danger";
      return res.redirect("/add/donations");
    }

    // Save the donation to the database
    await knex("donations").insert(newData);

    console.log("Donation successfully inserted");

    if (isAjaxRequest) {
      // AJAX request - return JSON so the page can show a thank you message
      return res.json({
        success: true,
        user_id: newData.user_id,
      });
    }

    // Regular form submission - redirect to donations list with success message
    req.session.flashMessage = "Donation added successfully!";
    req.session.flashType = "success";
    res.redirect("/donations");
  } catch (err) {
    console.error("Error adding donation:", err);

    if (isAjaxRequest) {
      return res.json({
        success: false,
        error: err.message,
      });
    }

    // Regular form submission - redirect with error message
    req.session.flashMessage = "Error adding donation: " + err.message;
    req.session.flashType = "danger";
    res.redirect("/add/donations");
  }
});

// ============================================================================
// PROFILE PAGE - User dashboard showing all their information
// ============================================================================

// Profile page route - shows a user's complete profile with tabs for different data
// This is one of the most complex routes - it pulls data from multiple tables and
// organizes it into a dashboard with quick stats, personal info, milestones, donations, etc.
app.get("/profile/:id", async (req, res) => {
  const participantId = req.params.id;

  // Security check: regular users can only see their own profile
  // Admins and sponsors can view anyone's profile
  if (req.session.user) {
    const userRole = req.session.user.role?.toLowerCase();
    const userId = req.session.user.id;

    // If you're not an admin/sponsor and you're trying to view someone else's profile, deny access
    if (
      userRole !== "admin" &&
      userRole !== "sponsor" &&
      parseInt(participantId) !== parseInt(userId)
    ) {
      return res
        .status(403)
        .send("Access denied. You can only view your own profile.");
    }
  }

  try {
    // Get the user's basic info and calculate their total donations
    // We use a LEFT JOIN so we get the user even if they have no donations
    const participant = await knex("users")
      .leftJoin("donations", "users.user_id", "donations.user_id")
      .where("users.user_id", participantId)
      .groupBy("users.user_id")
      .select(
        "users.user_id",
        "users.participant_email",
        "users.participant_first_name",
        "users.participant_last_name",
        "users.participant_dob",
        "users.participant_role",
        "users.participant_phone",
        "users.participant_city",
        "users.participant_state",
        "users.participant_zip",
        "users.participant_school_or_employer",
        "users.participant_field_of_interest",
        "users.participant_username",
        // Sum up all their donations to show total
        knex.raw(
          'COALESCE(SUM(donations.donation_amount), 0) as "Total_Donations"'
        )
      )
      .first();

    // Make sure the user actually exists
    if (!participant) {
      return res.status(404).send("User not found");
    }

    // Convert the total donations to a number (database returns it as a string)
    participant.Total_Donations = parseFloat(participant.Total_Donations) || 0;

    // Get all milestones for this user (achievements, accomplishments, etc.)
    // Sorted newest first so recent achievements show at the top
    const milestones = await knex("milestones")
      .where("user_id", participantId)
      .select(
        "milestone_id",
        "milestone_title",
        "milestone_date",
        "milestone_category"
      )
      .orderBy("milestone_date", "desc");

    // Get all donations for this user - shows their donation history
    const donations = await knex("donations")
      .where("user_id", participantId)
      .select("donation_id", "donation_date", "donation_amount")
      .orderByRaw("donation_date DESC NULLS LAST"); // Newest first, nulls at the end

    // Convert donation amounts to numbers (database stores them as strings)
    donations.forEach((donation) => {
      donation.donation_amount = parseFloat(donation.donation_amount) || 0;
    });

    // Get event registrations - shows which events they've signed up for
    // We join with events table to get event details (name, date, location, etc.)
    const eventRegistrations = await knex("event_registrations as er")
      .join("events as e", "er.event_id", "e.event_id")
      .where("er.user_id", participantId)
      .select(
        "er.event_registration_id",
        "er.user_id",
        "er.event_id",
        "er.registration_status",
        "er.registration_attended_flag",
        "er.registration_created_at_date",
        "er.registration_created_at_time",
        "er.registration_check_in_date",
        "er.registration_check_in_time",
        "e.event_name",
        "e.event_date",
        "e.event_start_time",
        "e.event_end_time",
        "e.event_location"
      )
      .orderBy([
        { column: "er.registration_created_at_date", order: "desc" },
        { column: "er.registration_created_at_time", order: "desc" },
      ]);

    // Get survey results - feedback they've given after attending events
    // Surveys are linked to event registrations, so we join through that
    const surveys = await knex("survey_results as sr")
      .innerJoin(
        "event_registrations as er",
        "sr.event_registration_id",
        "er.event_registration_id"
      )
      .innerJoin("events as e", "er.event_id", "e.event_id")
      .where("er.user_id", participantId)
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
        "sr.submission_time",
        "e.event_name",
        "e.event_date"
      )
      .orderBy([
        { column: "sr.submission_date", order: "desc" },
        { column: "sr.submission_time", order: "desc" },
      ]);

    // Convert survey scores to numbers (database returns strings)
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

    // ============================================================================
    // QUICK VIEW DASHBOARD DATA - Stats shown on the "Quick View" tab
    // ============================================================================
    // These are the numbers and lists shown in the dashboard cards
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let upcomingEvents = [];
    let upcomingEventsCount = 0;
    let attendedEventsCount = 0;
    let pendingSurveys = [];
    let pendingSurveysCount = 0;

    try {
      // Get upcoming events (registered AND future dated)
      upcomingEvents = await knex("event_registrations as er")
        .join("events as e", "er.event_id", "e.event_id")
        .where("er.user_id", participantId)
        .where("e.event_date", ">=", today)
        .select(
          "e.event_id",
          "e.event_name",
          "e.event_date",
          "e.event_start_time",
          "e.event_end_time",
          "e.event_location"
        )
        .orderBy("e.event_date", "asc")
        .limit(5); // Show up to 5 upcoming events

      // Count of upcoming events
      upcomingEventsCount = upcomingEvents ? upcomingEvents.length : 0;
    } catch (error) {
      console.error("Error fetching upcoming events:", error);
      upcomingEvents = [];
      upcomingEventsCount = 0;
    }

    try {
      // Count of attended events (registration_attended_flag is stored as integer: 1 = true, 0 = false)
      const attendedResult = await knex("event_registrations")
        .where("user_id", participantId)
        .where("registration_attended_flag", 1) // Changed from true to 1
        .count("* as count")
        .first();

      attendedEventsCount = attendedResult
        ? parseInt(attendedResult.count) || 0
        : 0;
    } catch (error) {
      console.error("Error counting attended events:", error);
      attendedEventsCount = 0;
    }

    try {
      // Get pending surveys (attended events without survey results)
      // Use NOT EXISTS to properly exclude events that have ANY survey submitted
      pendingSurveys = await knex("event_registrations as er")
        .join("events as e", "er.event_id", "e.event_id")
        .where("er.user_id", participantId)
        .where("er.registration_attended_flag", 1) // Changed from true to 1
        .whereNotExists(function () {
          this.select("*")
            .from("survey_results as sr")
            .whereRaw("sr.event_registration_id = er.event_registration_id")
            .whereNotNull("sr.survey_id")
            .whereNotNull("sr.submission_date");
        }) // No survey submitted yet (checking that NO survey exists for this registration)
        .select(
          "er.event_registration_id",
          "er.event_id",
          "e.event_name",
          "e.event_date"
        )
        .distinct() // Ensure no duplicates
        .orderBy("e.event_date", "desc");

      // Count of pending surveys
      pendingSurveysCount = pendingSurveys ? pendingSurveys.length : 0;
    } catch (error) {
      console.error("Error fetching pending surveys:", error);
      pendingSurveys = [];
      pendingSurveysCount = 0;
    }

    // ============================================================================
    // SPONSOR & ADMIN DASHBOARD DATA - Different stats for admins/sponsors
    // ============================================================================
    // Admins and sponsors see organization-wide stats, not just their own
    let allUpcomingEvents = [];
    let allUpcomingEventsCount = 0;
    let participantCount = 0;
    let sponsorCount = 0;
    let totalRegistrations = 0;

    // Get all upcoming events across the organization (not just for this user)
    try {
      allUpcomingEvents = await knex("events")
        .where("event_date", ">=", today)
        .select(
          "event_id",
          "event_name",
          "event_date",
          "event_start_time",
          "event_end_time",
          "event_location"
        )
        .orderBy("event_date", "asc")
        .limit(10); // Show up to 10 upcoming events

      allUpcomingEventsCount = allUpcomingEvents ? allUpcomingEvents.length : 0;
    } catch (error) {
      console.error("Error fetching all upcoming events:", error);
      allUpcomingEvents = [];
      allUpcomingEventsCount = 0;
    }

    // Count total participants in the system (admin-only stat)
    try {
      const participantResult = await knex("users")
        .where("participant_role", "participant")
        .count("* as count")
        .first();

      participantCount = participantResult
        ? parseInt(participantResult.count) || 0
        : 0;
    } catch (error) {
      console.error("Error counting participants:", error);
      participantCount = 0;
    }

    // Count total sponsors (admin-only stat)
    try {
      const sponsorResult = await knex("users")
        .where("participant_role", "sponsor")
        .count("* as count")
        .first();

      sponsorCount = sponsorResult ? parseInt(sponsorResult.count) || 0 : 0;
    } catch (error) {
      console.error("Error counting sponsors:", error);
      sponsorCount = 0;
    }

    // Count total event registrations across all events (admin-only stat)
    try {
      const registrationsResult = await knex("event_registrations")
        .count("* as count")
        .first();

      totalRegistrations = registrationsResult
        ? parseInt(registrationsResult.count) || 0
        : 0;
    } catch (error) {
      console.error("Error counting registrations:", error);
      totalRegistrations = 0;
    }

    // Render the page with all data
    res.render("profile", {
      participant: participant,
      milestones: milestones,
      donations: donations,
      eventRegistrations: eventRegistrations,
      surveys: surveys,
      // Participant dashboard data
      upcomingEvents: upcomingEvents,
      upcomingEventsCount: upcomingEventsCount,
      attendedEventsCount: attendedEventsCount,
      pendingSurveys: pendingSurveys,
      pendingSurveysCount: pendingSurveysCount,
      // Sponsor & Admin dashboard data
      allUpcomingEvents: allUpcomingEvents,
      allUpcomingEventsCount: allUpcomingEventsCount,
      participantCount: participantCount,
      sponsorCount: sponsorCount,
      totalRegistrations: totalRegistrations,
      // Session data for navigation
      isLoggedIn: req.session.isLoggedIn || false,
      userId: req.session.user?.id || null,
      role: req.session.user?.role || null,
    });
  } catch (error) {
    console.error("Error loading profile dashboard:", error);
    res.status(500).send("Error loading profile dashboard");
  }
});

// ============================================================================
// PROFILE EDIT ROUTES - Editing records from the profile page
// ============================================================================
// These routes are similar to the regular edit routes, but they redirect back
// to the profile page instead of the list page. Used when editing from profile tabs.

// Show edit form for a record from the profile page
// The form will redirect back to profile when submitted (instead of list page)
app.get("/profile-edit/:table/:id", async (req, res) => {
  let table_name = req.params.table;
  const id = req.params.id;

  // Backward compatibility
  if (table_name === "participants") {
    table_name = "users";
  }

  // Map table names to their primary key columns
  const primaryKeyByTable = {
    users: "user_id",
    participants: "user_id",
    milestones: "milestone_id",
    events: "event_id",
    survey_results: "survey_id",
    donations: "donation_id",
    event_registrations: "event_registration_id",
  };

  const primaryKey = primaryKeyByTable[table_name];

  try {
    let info;

    // Surveys need special handling - join with event_registrations and events
    // to get the event info for the dropdown
    if (table_name === "survey_results") {
      info = await knex("survey_results as s")
        .join(
          "event_registrations as er",
          "s.event_registration_id",
          "er.event_registration_id"
        )
        .join("events as e", "er.event_id", "e.event_id")
        .join("users as p", "er.user_id", "p.user_id")
        .where("s.survey_id", id)
        .select(
          "s.*",
          "e.event_id",
          "e.event_name",
          "e.event_date",
          "p.user_id"
        )
        .first();
    } else {
      // For other tables, just get the record directly
      info = await knex(table_name).where(primaryKey, id).first();
    }

    // Load dropdown data if needed
    let events = [];
    let event_types = [];

    // If editing an event, load event types for the dropdown
    if (table_name === "events") {
      event_types = await knex("event_types")
        .select("event_type_id", "event_type_name")
        .orderBy("event_type_name");
    }

    // If editing surveys or registrations, load events for the dropdown
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

    // Render edit form with fromProfile flag - this tells the form to redirect to profile
    res.render("edit", {
      table_name,
      info,
      id,
      events,
      event_types,
      fromProfile: true, // This flag makes the form redirect back to profile
      isLoggedIn: req.session.isLoggedIn || false,
      userId: req.session.user?.id || null,
      role: req.session.user?.role || null,
      language: req.session.language || "en",
    });
  } catch (err) {
    console.error("Error fetching entry:", err.message);
    // Redirect back to profile with error message
    req.session.flashMessage = "Error loading edit page: " + err.message;
    req.session.flashType = "danger";
    res.redirect(`/profile/${req.session.user.id}?tab=profile`);
  }
});

// Handle form submission when editing from profile page
// Updates the record and redirects back to profile (not list page)
app.post("/profile-edit/:table/:id", async (req, res) => {
  let table_name = req.params.table;
  const id = req.params.id;
  let updatedData = req.body;

  // Backward compatibility
  if (table_name === "participants") {
    table_name = "users";
  }

  const primaryKeyByTable = {
    users: "user_id",
    participants: "user_id",
    milestones: "milestone_id",
    events: "event_id",
    survey_results: "survey_id",
    donations: "donation_id",
    event_registrations: "event_registration_id",
  };

  const primaryKey = primaryKeyByTable[table_name];

  try {
    // Surveys need special handling - they store event_registration_id, not event_id/user_id directly
    if (table_name === "survey_results") {
      const { user_id, event_id, event_name, ...surveyFields } = updatedData;

      // Get existing survey to preserve event_registration_id if not changing event/user
      const existingSurvey = await knex("survey_results")
        .where("survey_id", id)
        .select("event_registration_id")
        .first();

      // If they're changing the event/user, find the new event_registration_id
      if (event_id && user_id) {
        const registration = await knex("event_registrations")
          .where({ event_id: parseInt(event_id), user_id: parseInt(user_id) })
          .first();

        if (registration) {
          surveyFields.event_registration_id =
            registration.event_registration_id;
        } else {
          throw new Error(
            "No event registration found for the specified user and event"
          );
        }
      } else if (existingSurvey && existingSurvey.event_registration_id) {
        // Keep the existing event_registration_id if not changing event/user
        surveyFields.event_registration_id =
          existingSurvey.event_registration_id;
      }

      // Only update valid survey_results columns
      const validColumns = [
        "event_registration_id",
        "survey_satisfaction_score",
        "survey_usefulness_score",
        "survey_instructor_score",
        "survey_recommendation_score",
        "survey_overall_score",
        "survey_nps_bucket",
        "survey_comments",
        "submission_date",
        "submission_time",
      ];

      updatedData = {};
      for (const key of validColumns) {
        if (surveyFields[key] !== undefined) {
          updatedData[key] = surveyFields[key];
        }
      }
    }

    // Special handling for event_registrations - filter out invalid columns
    if (table_name === "event_registrations") {
      const { event_name, registration_attend_status, ...registrationFields } =
        updatedData;

      // Map registration_attend_status to registration_attended_flag if provided
      if (registration_attend_status !== undefined) {
        registrationFields.registration_attended_flag =
          registration_attend_status === "1" || registration_attend_status === 1
            ? 1
            : 0;
      }

      // Only update valid event_registrations columns
      const validColumns = [
        "user_id",
        "event_id",
        "registration_status",
        "registration_attended_flag",
        "registration_created_at_date",
        "registration_created_at_time",
        "registration_check_in_date",
        "registration_check_in_time",
      ];

      updatedData = {};
      for (const key of validColumns) {
        if (registrationFields[key] !== undefined) {
          updatedData[key] = registrationFields[key];
        }
      }
    }

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

// PROFILE DELETE ROUTE (called from profile page)
app.post("/profile-delete/:table/:id", async (req, res) => {
  let { table, id } = req.params;

  // Backward compatibility: map old "participants" to "users"
  if (table === "participants") {
    table = "users";
  }

  const primaryKeyByTable = {
    users: "user_id",
    participants: "user_id", // backward compatibility
    milestones: "milestone_id",
    events: "event_id",
    survey_results: "survey_id",
    donations: "donation_id",
    event_registrations: "event_registration_id",
  };

  const primaryKey = primaryKeyByTable[table];

  try {
    // Special handling for deleting the user's own account (users table)
    if (table === "users" && parseInt(id) === req.session.user.id) {
      // Delete the participant
      await knex(table).where(primaryKey, id).del();

      // Log them out
      req.session.isLoggedIn = false;
      req.session.user = null;

      // Destroy session and redirect to home
      req.session.destroy((err) => {
        if (err) {
          console.error("Error logging out after account deletion:", err);
        }
        res.status(200).json({
          success: true,
          redirect: "/",
        });
      });
    } else {
      // Normal delete for other records
      await knex(table).where(primaryKey, id).del();
      res.status(200).json({ success: true });
    }
  } catch (err) {
    console.log("Error deleting record:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// ADMIN DASHBOARD PAGES - Database management pages for admins
// ============================================================================

// Users maintenance page - admins can view and manage all users
// This page has filtering, searching, and sorting capabilities
app.get("/users", requireAdmin, async (req, res) => {
  try {
    // Get flash messages (success/error messages from previous actions)
    const sessionData = req.session || {};
    let message = sessionData.flashMessage || "";
    let messageType = sessionData.flashType || "success";

    // Clear flash messages after displaying them (so they don't show again)
    sessionData.flashMessage = null;
    sessionData.flashType = null;

    // Fallback to query params for messages (used when deleting via AJAX)
    if (!message && req.query.message) {
      message = req.query.message;
      messageType = req.query.messageType || "success";
    }

    // ============================================================================
    // FILTERING AND SORTING - Build the database query based on user filters
    // ============================================================================
    // Users can filter by city, role, interest, donations, and search by name
    let {
      searchColumn,
      searchValue,
      city,
      role,
      interest,
      donations,
      sortColumn,
      sortOrder,
    } = req.query;

    // Default values if nothing specified
    searchColumn = searchColumn || "full_name";
    sortOrder = sortOrder === "desc" ? "desc" : "asc";

    // Start building the database query
    let query = knex("users");

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

    // Role filter
    const roleArr = paramToArray(role);
    if (!roleArr.includes("all")) {
      query.whereIn("participant_role", roleArr);
    }

    // City filter
    const cityArr = paramToArray(city);
    if (!cityArr.includes("all")) {
      query.whereIn("participant_city", cityArr);
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
      role: roleArr,
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
        role: ["all"],
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

// Participants maintenance page - shows only users with "participant" role
// Similar to /users but filtered to only show participants (not admins/sponsors)
app.get("/participants", requireAdmin, async (req, res) => {
  try {
    // Get flash messages (success/error messages from previous actions)
    const sessionData = req.session || {};
    let message = sessionData.flashMessage || "";
    let messageType = sessionData.flashType || "success";

    // Clear flash messages after displaying them
    sessionData.flashMessage = null;
    sessionData.flashType = null;

    // Fallback to query params for messages (used when deleting via AJAX)
    if (!message && req.query.message) {
      message = req.query.message;
      messageType = req.query.messageType || "success";
    }

    // ============================================================================
    // FILTERING AND SORTING - Build query based on user filters
    // ============================================================================
    // Users can filter by city, school, interest, donations, and search by name
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

    // Default values if nothing specified
    searchColumn = searchColumn || "full_name";
    sortOrder = sortOrder === "desc" ? "desc" : "asc";

    // Start building the database query
    let query = knex("users");

    // Important: Only show participants (filter out admins and sponsors)
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

// Events maintenance page - admins can view and manage all events
// Shows events with their types, dates, locations, capacity, etc.
app.get("/events", requireAdmin, async (req, res) => {
  try {
    // Get flash messages
    const sessionData = req.session || {};
    let message = sessionData.flashMessage || "";
    let messageType = sessionData.flashType || "success";

    sessionData.flashMessage = null;
    sessionData.flashType = null;

    // Fallback to query params for messages
    if (!message && req.query.message) {
      message = req.query.message;
      messageType = req.query.messageType || "success";
    }

    // ============================================================================
    // FILTERING AND SORTING - Build query based on filters
    // ============================================================================
    // Users can filter by event name, location, type, month, year, and search
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

    // Default values
    searchColumn = searchColumn || "event_name";
    sortOrder = sortOrder === "desc" ? "desc" : "asc";

    // Join with event_types table to get event type names
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

    // Handle search - can search by event name, location, capacity, etc.
    if (searchValue && searchColumn) {
      const term = searchValue.trim();
      if (term) {
        const likeTerm = `%${term}%`;
        // Special handling for numeric columns (like capacity)
        if (searchColumn === "event_capacity") {
          // Try to match as a number if they typed a number
          const numTerm = parseInt(term);
          if (!isNaN(numTerm)) {
            query.where("e.event_capacity", numTerm);
          }
        } else {
          // For text columns, use case-insensitive search
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
        const placeholders = monthNums.map(() => "?").join(",");
        query.whereRaw(
          `EXTRACT(MONTH FROM e.event_date) IN (${placeholders})`,
          monthNums
        );
      }
    }

    // Years filter (extract year from event_date)
    const yearArr = paramToArray(years);
    if (!yearArr.includes("all")) {
      // Convert year strings to integers for comparison
      const yearNums = yearArr.map((y) => parseInt(y)).filter((y) => !isNaN(y));
      if (yearNums.length > 0) {
        const placeholders = yearNums.map(() => "?").join(",");
        query.whereRaw(
          `EXTRACT(YEAR FROM e.event_date) IN (${placeholders})`,
          yearNums
        );
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

// Surveys maintenance page - shows all survey responses with filtering
// Surveys are linked to event registrations, so we join through multiple tables
// to show who submitted what survey for which event

// Map UI column names to actual database column names (with table aliases)
// This lets us search by friendly names like "full_name" even though it's split across columns
const SURVEY_SEARCHABLE_COLUMNS = [
  "full_name",
  "participant_first_name",
  "participant_last_name",
  "event_name",
  "event_date",
  "survey_nps_bucket",
];

const SURVEY_COLUMN_MAP = {
  full_name: null, // Special case - handled separately in code
  participant_first_name: "p.participant_first_name",
  participant_last_name: "p.participant_last_name",
  event_name: "e.event_name",
  event_date: "e.event_date",
  survey_nps_bucket: "s.survey_nps_bucket",
};

app.get("/surveys", requireAdmin, async (req, res) => {
  try {
    // Get flash messages
    const sessionData = req.session || {};
    const message = sessionData.flashMessage || "";
    const messageType = sessionData.flashType || "success";
    sessionData.flashMessage = null;
    sessionData.flashType = null;

    // Get filter parameters from query string
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

    // Default to searching by full name if nothing specified
    if (!searchColumn) {
      searchColumn = "full_name";
    }
    // Security check - only allow searching by columns we've defined
    if (
      searchColumn !== "full_name" &&
      !SURVEY_SEARCHABLE_COLUMNS.includes(searchColumn)
    ) {
      searchColumn = "full_name";
    }

    sortOrder = sortOrder === "desc" ? "desc" : "asc";

    // Build the main query - join survey_results with event_registrations, users, and events
    // This lets us show participant names, event names, and survey scores all together
    let query = knex("survey_results as s")
      .join(
        "event_registrations as er",
        "s.event_registration_id",
        "er.event_registration_id"
      )
      .join("users as p", "er.user_id", "p.user_id")
      .join("events as e", "er.event_id", "e.event_id")
      .select(
        "s.survey_id",
        "s.event_registration_id",
        "p.user_id",
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

    // Handle search - can search by participant name, event name, etc.
    if (searchValue) {
      const term = searchValue.trim();
      if (term) {
        if (searchColumn === "full_name") {
          // Special handling for full name search - split into first/last name parts
          const parts = term.split(/\s+/);

          if (parts.length === 1) {
            // One word - search first OR last name
            const likeOne = `%${parts[0]}%`;
            query.where(function () {
              this.where("p.participant_first_name", "ilike", likeOne).orWhere(
                "p.participant_last_name",
                "ilike",
                likeOne
              );
            });
          } else {
            // Multiple words - first word is first name, last word is last name
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
          // Search by a single column (event name, NPS bucket, etc.)
          const dbCol = SURVEY_COLUMN_MAP[searchColumn];
          if (dbCol) {
            query.whereRaw(`CAST(${dbCol} AS TEXT) ILIKE ?`, [`%${term}%`]);
          }
        }
      }
    }

    // Apply filters - users can filter by event, satisfaction scores, NPS bucket, etc.
    const eventNameArr = paramToArray(eventNames);
    if (!eventNameArr.includes("all")) {
      query.whereIn("e.event_name", eventNameArr);
    }

    // Filter by satisfaction score (1-5 scale)
    const satArr = paramToArray(satisfaction);
    if (!satArr.includes("all")) {
      query.whereIn("s.survey_satisfaction_score", satArr.map(Number));
    }

    // Filter by usefulness score
    const usefulArr = paramToArray(usefulness);
    if (!usefulArr.includes("all")) {
      query.whereIn("s.survey_usefulness_score", usefulArr.map(Number));
    }

    // Filter by instructor score
    const instrArr = paramToArray(instructor);
    if (!instrArr.includes("all")) {
      query.whereIn("s.survey_instructor_score", instrArr.map(Number));
    }

    // Filter by recommendation score
    const recArr = paramToArray(recommendation);
    if (!recArr.includes("all")) {
      query.whereIn("s.survey_recommendation_score", recArr.map(Number));
    }

    // Filter by overall score
    const overallArr = paramToArray(overall);
    if (!overallArr.includes("all")) {
      query.whereIn("s.survey_overall_score", overallArr.map(Number));
    }

    // Filter by NPS bucket (Promoter, Passive, Detractor)
    const npsArr = paramToArray(nps);
    if (!npsArr.includes("all")) {
      query.whereIn("s.survey_nps_bucket", npsArr);
    }

    // Apply sorting
    if (sortColumn) {
      const sortDbCol = SURVEY_COLUMN_MAP[sortColumn];
      if (sortDbCol) {
        query.orderByRaw(`${sortDbCol} ${sortOrder}`);
      }
    }

    // Get lists of available options for the filter dropdowns
    // These queries run independently so filters always show all available options
    const eventNameOptionsPromise = knex("events")
      .distinct("event_name")
      .orderBy("event_name");

    const npsOptionsPromise = knex("survey_results")
      .distinct("survey_nps_bucket")
      .whereNotNull("survey_nps_bucket")
      .orderBy("survey_nps_bucket");

    // Run all queries in parallel for better performance
    const [eventNameRows, npsRows, results] = await Promise.all([
      eventNameOptionsPromise,
      npsOptionsPromise,
      query,
    ]);

    // Clean up the results - remove any null/empty values
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

// Milestones maintenance page - shows all participant achievements/milestones
// Milestones track participant accomplishments and progress
app.get("/milestones", requireAdmin, async (req, res) => {
  try {
    // Get flash messages
    const sessionData = req.session || {};
    let message = sessionData.flashMessage || "";
    let messageType = sessionData.flashType || "success";

    sessionData.flashMessage = null;
    sessionData.flashType = null;

    // Fallback to query params for messages
    if (!message && req.query.message) {
      message = req.query.message;
      messageType = req.query.messageType || "success";
    }

    // ============================================================================
    // FILTERING AND SORTING
    // ============================================================================
    let {
      searchColumn,
      searchValue,
      milestoneTitles,
      categories,
      sortColumn,
      sortOrder,
    } = req.query;

    // Default values
    searchColumn = searchColumn || "full_name";
    sortOrder = sortOrder === "desc" ? "desc" : "asc";

    // Join with users table to get participant names
    let query = knex("milestones as m")
      .join("users as p", "m.user_id", "p.user_id")
      .select(
        "m.milestone_id",
        "p.user_id",
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

// Donations maintenance page - shows all donations with donor information
// Admins can filter by date, search by donor name, and see donation amounts
app.get("/donations", requireAdmin, async (req, res) => {
  try {
    // Get flash messages
    const sessionData = req.session || {};
    let message = sessionData.flashMessage || "";
    let messageType = sessionData.flashType || "success";

    sessionData.flashMessage = null;
    sessionData.flashType = null;

    // Fallback to query params for messages
    if (!message && req.query.message) {
      message = req.query.message;
      messageType = req.query.messageType || "success";
    }

    // ============================================================================
    // FILTERING AND SORTING
    // ============================================================================
    // Users can filter by month/year and search by donor name
    let { searchColumn, searchValue, months, years, sortColumn, sortOrder } =
      req.query;

    // Default values
    searchColumn = searchColumn || "full_name";
    sortOrder = sortOrder === "desc" ? "desc" : "asc";

    // Join with users table to get donor names
    let query = knex("donations as d")
      .join("users as p", "d.user_id", "p.user_id")
      .select(
        "d.donation_id",
        "d.user_id",
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
        const placeholders = monthNums.map(() => "?").join(",");
        query.whereRaw(
          `EXTRACT(MONTH FROM d.donation_date) IN (${placeholders})`,
          monthNums
        );
      }
    }

    // Years filter (extract year from donation_date)
    const yearArr = paramToArray(years);
    if (!yearArr.includes("all")) {
      const yearNums = yearArr.map((y) => parseInt(y)).filter((y) => !isNaN(y));
      if (yearNums.length > 0) {
        const placeholders = yearNums.map(() => "?").join(",");
        query.whereRaw(
          `EXTRACT(YEAR FROM d.donation_date) IN (${placeholders})`,
          yearNums
        );
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
      // Default sort by donation_date descending, nulls last
      query.orderByRaw("d.donation_date DESC NULLS LAST");
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
app.get("/add/:table", requireAdmin, async (req, res) => {
  let table_name = req.params.table;

  // Backward compatibility: map old "participants" to "users"
  if (table_name === "participants") {
    table_name = "users";
  }

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

  res.render("add", {
    table_name,
    events,
    event_types,
    pass_id: null,
    survey_prefill: null,
  });
});

// Show the "Add New Record" form with a pre-filled user ID
// This version is called from profile pages - it pre-fills the user_id field
// so admins can quickly add records (like donations) for a specific user
app.get("/add/:table/:id", requireAdmin, async (req, res) => {
  let table_name = req.params.table;
  const pass_id = req.params.id;

  // Backward compatibility
  if (table_name === "participants") {
    table_name = "users";
  }

  let events = [];
  let event_types = [];

  // Load event types if we're adding an event
  if (table_name === "events") {
    event_types = await knex("event_types")
      .select("event_type_id", "event_name")
      .orderBy("event_name");
  }

  // Load events list if we're adding a survey or registration
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

  // Render form with user ID pre-filled
  res.render("add", {
    table_name,
    events,
    event_types,
    pass_id, // Pre-filled user ID
    survey_prefill: null,
  });
});

// ============================================================================
// USER-FACING ADD ROUTES - Let users add their own data
// ============================================================================

// Route for participants to add their own milestones (achievements, accomplishments)
// This is accessible from the profile page - users can track their own progress
app.get("/profile-add/milestones/:userId", async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  if (!Number.isInteger(userId)) {
    return res.status(400).send("Invalid participant id.");
  }

  // Security check - users can only add milestones to their own profile
  if (!requireSelfOrAdmin(req, res, userId)) return;

  // Render the add form with the user ID pre-filled
  res.render("add", {
    table_name: "milestones",
    events: [],
    event_types: [],
    pass_id: userId, // Pre-fill the user_id field
    survey_prefill: null,
  });
});

// Route for participants to add survey results after attending an event
// They can only submit surveys for events they actually registered for and attended
app.get(
  "/profile-add/survey_results/:eventRegistrationId",
  async (req, res) => {
    const eventRegistrationId = parseInt(req.params.eventRegistrationId, 10);
    if (!Number.isInteger(eventRegistrationId)) {
      return res.status(400).send("Invalid event registration id.");
    }

    // Get the registration and event details
    const registration = await knex("event_registrations as er")
      .join("events as e", "er.event_id", "e.event_id")
      .where("er.event_registration_id", eventRegistrationId)
      .select(
        "er.event_registration_id",
        "er.user_id",
        "er.event_id",
        "e.event_name",
        "e.event_date",
        "e.event_start_time",
        "e.event_end_time"
      )
      .first();

    if (!registration) {
      return res.status(404).send("Event registration not found.");
    }

    // Security check - users can only submit surveys for their own registrations
    if (!requireSelfOrAdmin(req, res, registration.user_id)) return;

    // Pre-fill the form with the event info (they're reviewing this specific event)
    const events = [
      {
        event_id: registration.event_id,
        event_name: registration.event_name,
        event_date: registration.event_date,
        event_start_time: registration.event_start_time,
        event_end_time: registration.event_end_time,
      },
    ];

    res.render("add", {
      table_name: "survey_results",
      events,
      event_types: [],
      pass_id: registration.user_id,
      survey_prefill: {
        event_registration_id: registration.event_registration_id,
        event_id: registration.event_id,
        event_name: registration.event_name,
      },
    });
  }
);

// Handle form submission for adding new records
// This gets called when someone submits the "Add" form from admin dashboard pages
app.post("/add/:table", requireAdmin, async (req, res) => {
  let table_name = req.params.table;
  let newData = req.body;

  // Backward compatibility
  if (table_name === "participants") {
    table_name = "users";
  }

  try {
    // ============================================================================
    // SPECIAL HANDLING FOR DIFFERENT TABLES
    // ============================================================================

    // Event registrations need special handling - filter out form-only fields
    // and convert checkbox values to database flags
    if (table_name === "event_registrations") {
      const { event_name, registration_attend_status, ...registrationFields } =
        newData;

      // Convert checkbox value (string "1" or number 1) to database flag (0 or 1)
      if (registration_attend_status !== undefined) {
        registrationFields.registration_attended_flag =
          registration_attend_status === "1" || registration_attend_status === 1
            ? 1
            : 0;
      }

      // Only allow inserting valid columns (security - prevent SQL injection)
      const validColumns = [
        "user_id",
        "event_id",
        "registration_status",
        "registration_attended_flag",
        "registration_created_at_date",
        "registration_created_at_time",
        "registration_check_in_date",
        "registration_check_in_time",
      ];

      newData = {};
      for (const key of validColumns) {
        if (registrationFields[key] !== undefined) {
          newData[key] = registrationFields[key];
        }
      }
    }

    // Surveys need special handling - prevent duplicate surveys for same registration
    // If a survey already exists for this event registration, update it instead of creating a new one
    if (table_name === "survey_results" && newData.event_registration_id) {
      const existingSurveys = await knex("survey_results")
        .where("event_registration_id", newData.event_registration_id)
        .orderBy("survey_id", "desc");

      if (existingSurveys.length > 0) {
        // Find the most complete survey (one with actual scores) or use the most recent
        const hasData = (s) => {
          const score =
            s.survey_satisfaction_score ||
            s.survey_usefulness_score ||
            s.survey_instructor_score ||
            s.survey_recommendation_score ||
            s.survey_overall_score;
          return score !== null && score !== undefined && score !== "";
        };

        let surveyToUpdate =
          existingSurveys.find(hasData) || existingSurveys[0];

        // Convert empty strings to null (database expects null, not empty strings)
        const normalizeValue = (val) =>
          val === "" || val === null || val === undefined ? null : val;
        const normalizedData = { ...newData };
        [
          "survey_satisfaction_score",
          "survey_usefulness_score",
          "survey_instructor_score",
          "survey_recommendation_score",
          "survey_overall_score",
          "survey_nps_bucket",
          "survey_comments",
        ].forEach((key) => {
          if (normalizedData[key] !== undefined) {
            normalizedData[key] = normalizeValue(normalizedData[key]);
          }
        });

        // Update the existing survey instead of creating a duplicate
        await knex("survey_results")
          .where("survey_id", surveyToUpdate.survey_id)
          .update(normalizedData);

        // Delete any other duplicate surveys (shouldn't happen, but just in case)
        if (existingSurveys.length > 1) {
          const idsToDelete = existingSurveys
            .filter((s) => s.survey_id !== surveyToUpdate.survey_id)
            .map((s) => s.survey_id);
          if (idsToDelete.length > 0) {
            await knex("survey_results")
              .whereIn("survey_id", idsToDelete)
              .delete();
          }
        }

        req.session.flashMessage = "Survey updated!";
        req.session.flashType = "success";
        res.redirect("/surveys");
        return;
      }
    }

    // For all other tables, just insert the new record
    await knex(table_name).insert(newData);

    // Set success message
    req.session.flashMessage = "Added Successfully!";
    req.session.flashType = "success";

    // Redirect back to the list page (with special handling for some tables)
    if (table_name === "survey_results") {
      res.redirect("/surveys");
    } else if (table_name === "event_registrations") {
      res.redirect("/event_registrations");
    } else {
      res.redirect(`/${table_name}`);
    }
  } catch (err) {
    console.log("Error adding record:", err.message);

    // Set error message
    req.session.flashMessage = "Error adding record: " + err.message;
    req.session.flashType = "danger";

    // Redirect back with error (with special handling for some tables)
    if (table_name === "survey_results") {
      res.redirect("/surveys");
    } else if (table_name === "event_registrations") {
      res.redirect("/event_registrations");
    } else {
      res.redirect(`/${table_name}`);
    }
  }
});

// Handle milestone submission from profile page
// Participants can add their own milestones (achievements) to track progress
app.post("/profile-add/milestones/:userId", async (req, res) => {
  const userId = parseInt(req.params.userId, 10);
  if (!Number.isInteger(userId)) {
    return res.status(400).send("Invalid participant id.");
  }

  // Security check - users can only add milestones to their own profile
  if (!requireSelfOrAdmin(req, res, userId)) return;

  const { milestone_title, milestone_category, milestone_date } = req.body;

  try {
    await knex("milestones").insert({
      user_id: userId,
      milestone_title,
      milestone_category,
      milestone_date,
    });

    req.session.flashMessage = "Added Successfully!";
    req.session.flashType = "success";
    res.redirect(`/profile/${userId}?tab=milestones`);
  } catch (err) {
    console.error("Error adding milestone:", err);
    req.session.flashMessage = "Error adding milestone: " + err.message;
    req.session.flashType = "danger";
    res.redirect(`/profile/${userId}?tab=milestones`);
  }
});

// Handle survey submission from profile page
// Participants can submit surveys after attending events they registered for
// This route prevents duplicate surveys - if one exists, it updates it instead
app.post(
  "/profile-add/survey_results/:eventRegistrationId",
  async (req, res) => {
    const eventRegistrationId = parseInt(req.params.eventRegistrationId, 10);
    if (!Number.isInteger(eventRegistrationId)) {
      return res.status(400).send("Invalid event registration id.");
    }

    // Get the event registration to verify it exists and get the user_id
    const registration = await knex("event_registrations")
      .where("event_registration_id", eventRegistrationId)
      .first();

    if (!registration) {
      return res.status(404).send("Event registration not found.");
    }

    // Security check - users can only submit surveys for their own registrations
    if (!requireSelfOrAdmin(req, res, registration.user_id)) return;

    // Get survey data from form
    const {
      survey_satisfaction_score,
      survey_usefulness_score,
      survey_instructor_score,
      survey_recommendation_score,
      survey_overall_score,
      survey_nps_bucket,
      survey_comments,
    } = req.body;

    // Get current date/time for submission timestamp
    const { date, time } = nowDate();

    try {
      // Check if a survey already exists for this event registration
      // We prevent duplicates - one survey per registration
      const existingSurveys = await knex("survey_results")
        .where("event_registration_id", eventRegistrationId)
        .orderBy("survey_id", "desc"); // Get most recent first

      // Convert empty strings to null (database expects null, not empty strings)
      const normalizeValue = (val) =>
        val === "" || val === null || val === undefined ? null : val;

      // Build survey data object with normalized values
      const surveyData = {
        event_registration_id: eventRegistrationId,
        survey_satisfaction_score: normalizeValue(survey_satisfaction_score),
        survey_usefulness_score: normalizeValue(survey_usefulness_score),
        survey_instructor_score: normalizeValue(survey_instructor_score),
        survey_recommendation_score: normalizeValue(
          survey_recommendation_score
        ),
        survey_overall_score: normalizeValue(survey_overall_score),
        survey_nps_bucket: normalizeValue(survey_nps_bucket),
        survey_comments: normalizeValue(survey_comments),
        submission_date: date,
        submission_time: time,
      };

      if (existingSurveys.length > 0) {
        // Survey already exists - update it instead of creating a duplicate
        // Find the most complete survey (one with actual scores) or use the most recent
        const hasData = (s) => {
          const score =
            s.survey_satisfaction_score ||
            s.survey_usefulness_score ||
            s.survey_instructor_score ||
            s.survey_recommendation_score ||
            s.survey_overall_score;
          return score !== null && score !== undefined && score !== "";
        };

        let surveyToUpdate =
          existingSurveys.find(hasData) || existingSurveys[0];

        // Update the existing survey
        await knex("survey_results")
          .where("survey_id", surveyToUpdate.survey_id)
          .update(surveyData);

        // Delete any other duplicate surveys (shouldn't happen, but cleanup just in case)
        if (existingSurveys.length > 1) {
          const idsToDelete = existingSurveys
            .filter((s) => s.survey_id !== surveyToUpdate.survey_id)
            .map((s) => s.survey_id);
          if (idsToDelete.length > 0) {
            await knex("survey_results")
              .whereIn("survey_id", idsToDelete)
              .delete();
          }
        }

        req.session.flashMessage = "Survey updated!";
      } else {
        // No survey exists - create a new one
        await knex("survey_results").insert(surveyData);
        req.session.flashMessage = "Survey submitted!";
      }

      req.session.flashType = "success";
      // Redirect back to profile surveys tab
      res.redirect(`/profile/${registration.user_id}?tab=surveys`);
    } catch (err) {
      console.error("Error adding survey result:", err);
      req.session.flashMessage = "Error adding survey result: " + err.message;
      req.session.flashType = "danger";
      res.redirect(`/profile/${registration.user_id}?tab=surveys`);
    }
  }
);

// ============================================================================
// DELETE ROUTE - Remove records from database
// ============================================================================
// This is called via AJAX from the admin dashboard pages when clicking delete
// Returns JSON response (not a redirect) so the page can update dynamically
app.post("/delete/:table/:id", requireAdmin, async (req, res) => {
  let { table, id } = req.params;

  // Backward compatibility
  if (table === "participants") {
    table = "users";
  }

  // Map table names to their primary key columns
  const primaryKeyByTable = {
    users: "user_id",
    participants: "user_id",
    milestones: "milestone_id",
    events: "event_id",
    survey_results: "survey_id",
    donations: "donation_id",
    event_registrations: "event_registration_id",
  };

  const primaryKey = primaryKeyByTable[table];

  try {
    // Delete the record from the database
    await knex(table).where(primaryKey, id).del();
    // Return success JSON - the frontend will handle removing the row from the table
    res.status(200).json({ success: true });
  } catch (err) {
    console.log("Error deleting record:", err.message);
    // Return error JSON - the frontend will show an error message
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// EDIT ROUTES - Show and handle edit forms
// ============================================================================
// These routes are for editing from the admin dashboard pages (not profile pages)
// They redirect back to the list page after editing

// Show edit form for a record - pre-fills form with existing data
app.get("/edit/:table/:id", requireAdmin, async (req, res) => {
  let table_name = req.params.table;
  const id = req.params.id;

  // Backward compatibility
  if (table_name === "participants") {
    table_name = "users";
  }

  const primaryKeyByTable = {
    users: "user_id",
    participants: "user_id",
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
        .join("users as p", "er.user_id", "p.user_id")
        .where("s.survey_id", id)
        .select(
          "s.*",
          "e.event_id",
          "e.event_name",
          "e.event_date",
          "p.user_id"
        )
        .first();
    } else {
      info = await knex(table_name).where(primaryKey, id).first();
    }

    if (!info) {
      req.session.flashMessage = "Entry not found.";
      req.session.flashType = "danger";
      const redirectPath =
        table_name === "survey_results"
          ? "/surveys"
          : table_name === "event_registrations"
          ? "/event_registrations"
          : `/${table_name}`;
      return res.redirect(redirectPath);
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

    res.render("edit", {
      table_name,
      info,
      id,
      events,
      event_types,
      isLoggedIn: req.session.isLoggedIn || false,
      userId: req.session.user?.id || null,
      role: req.session.user?.role || null,
      language: req.session.language || "en",
    });
  } catch (err) {
    console.error("Error fetching entry:", err.message);
    req.session.flashMessage = "Error loading edit page: " + err.message;
    req.session.flashType = "danger";
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
app.post("/edit/:table/:id", requireAdmin, async (req, res) => {
  let table_name = req.params.table;
  const id = req.params.id;
  let updatedData = req.body;

  // Backward compatibility: map old "participants" to "users"
  if (table_name === "participants") {
    table_name = "users";
  }

  const primaryKeyByTable = {
    users: "user_id",
    participants: "user_id", // backward compatibility
    milestones: "milestone_id",
    events: "event_id",
    survey_results: "survey_id",
    donations: "donation_id",
    event_registrations: "event_registration_id",
  };

  const primaryKey = primaryKeyByTable[table_name];

  try {
    // Special handling for survey_results - filter out invalid columns and handle event_registration_id
    if (table_name === "survey_results") {
      const { user_id, event_id, event_name, ...surveyFields } = updatedData;

      // Get the existing survey to preserve its event_registration_id if event/user aren't changed
      const existingSurvey = await knex("survey_results")
        .where("survey_id", id)
        .select("event_registration_id")
        .first();

      if (!existingSurvey) {
        throw new Error("Survey not found");
      }

      // If event_id and user_id are provided, find the corresponding event_registration_id
      if (event_id && user_id) {
        const registration = await knex("event_registrations")
          .where({ event_id: parseInt(event_id), user_id: parseInt(user_id) })
          .first();

        if (registration) {
          surveyFields.event_registration_id =
            registration.event_registration_id;
        } else {
          throw new Error(
            "No event registration found for the specified user and event"
          );
        }
      } else if (existingSurvey && existingSurvey.event_registration_id) {
        // If event_id/user_id aren't provided, preserve the existing event_registration_id
        surveyFields.event_registration_id =
          existingSurvey.event_registration_id;
      }

      // Only update valid survey_results columns
      const validColumns = [
        "event_registration_id",
        "survey_satisfaction_score",
        "survey_usefulness_score",
        "survey_instructor_score",
        "survey_recommendation_score",
        "survey_overall_score",
        "survey_nps_bucket",
        "survey_comments",
        "submission_date",
        "submission_time",
      ];

      updatedData = {};
      for (const key of validColumns) {
        if (surveyFields[key] !== undefined) {
          updatedData[key] = surveyFields[key];
        }
      }

      // Ensure event_registration_id is always set
      if (
        !updatedData.event_registration_id &&
        existingSurvey &&
        existingSurvey.event_registration_id
      ) {
        updatedData.event_registration_id =
          existingSurvey.event_registration_id;
      }

      // Validate that we have an event_registration_id before updating
      if (!updatedData.event_registration_id) {
        throw new Error(
          "Cannot update survey: event_registration_id is required"
        );
      }
    }

    // Special handling for event_registrations - filter out invalid columns
    if (table_name === "event_registrations") {
      const { event_name, registration_attend_status, ...registrationFields } =
        updatedData;

      // Map registration_attend_status to registration_attended_flag if provided
      if (registration_attend_status !== undefined) {
        registrationFields.registration_attended_flag =
          registration_attend_status === "1" || registration_attend_status === 1
            ? 1
            : 0;
      }

      // Only update valid event_registrations columns
      const validColumns = [
        "user_id",
        "event_id",
        "registration_status",
        "registration_attended_flag",
        "registration_created_at_date",
        "registration_created_at_time",
        "registration_check_in_date",
        "registration_check_in_time",
      ];

      updatedData = {};
      for (const key of validColumns) {
        if (registrationFields[key] !== undefined) {
          updatedData[key] = registrationFields[key];
        }
      }
    }

    // For survey_results, verify the record exists before updating
    if (table_name === "survey_results") {
      const existingRecord = await knex(table_name)
        .where(primaryKey, id)
        .first();

      if (!existingRecord) {
        throw new Error(
          `Survey with survey_id ${id} not found. Cannot update non-existent record.`
        );
      }
    }

    const rowsUpdated = await knex(table_name)
      .where(primaryKey, id)
      .update(updatedData);

    if (rowsUpdated === 0) {
      throw new Error(`No record found with ${primaryKey} = ${id} to update`);
    }

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

// Event registrations maintenance page - shows who registered for which events
// This is the admin view of all event registrations - useful for tracking attendance
app.get("/event_registrations", requireAdmin, async (req, res) => {
  try {
    // Get flash messages
    const sessionData = req.session || {};
    let message = sessionData.flashMessage || "";
    let messageType = sessionData.flashType || "success";

    sessionData.flashMessage = null;
    sessionData.flashType = null;

    // Fallback to query params for messages
    if (!message && req.query.message) {
      message = req.query.message;
      messageType = req.query.messageType || "success";
    }

    // ============================================================================
    // FILTERING AND SORTING
    // ============================================================================
    // Users can filter by event, date, registration status, attendance, etc.
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

    // Default values
    searchColumn = searchColumn || "full_name";
    sortOrder = sortOrder === "desc" ? "desc" : "asc";

    // Join with users and events tables to show participant names and event details
    let query = knex("event_registrations as er")
      .join("users as p", "er.user_id", "p.user_id")
      .join("events as e", "er.event_id", "e.event_id")
      .select(
        "er.event_registration_id",
        "p.user_id",
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
        const placeholders = monthNums.map(() => "?").join(",");
        query.whereRaw(
          `EXTRACT(MONTH FROM e.event_date) IN (${placeholders})`,
          monthNums
        );
      }
    }

    // Years filter (extract year from event_date)
    const yearArr = paramToArray(years);
    if (!yearArr.includes("all")) {
      const yearNums = yearArr.map((y) => parseInt(y)).filter((y) => !isNaN(y));
      if (yearNums.length > 0) {
        const placeholders = yearNums.map(() => "?").join(",");
        query.whereRaw(
          `EXTRACT(YEAR FROM e.event_date) IN (${placeholders})`,
          yearNums
        );
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
    // These queries are independent of the main filter query to always show all available options
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

    // Extract years from results - ensure they're numbers and unique
    const availableYears = (yearRows || [])
      .map((r) => {
        const year = r?.year;
        return year ? Math.floor(parseFloat(year)) : null;
      })
      .filter((y) => y !== null && !isNaN(y))
      .filter((y, index, self) => self.indexOf(y) === index) // Remove duplicates
      .sort((a, b) => b - a);

    const eventNameOptions = eventNameRows
      .map((r) => r.event_name)
      .filter(Boolean)
      .filter((name, index, self) => self.indexOf(name) === index); // Remove duplicates

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
      availableYears: availableYears || [],
      eventNameOptions: eventNameOptions || [],
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

// ============================================================================
// CHATBOT ROUTES - AI-powered career assistance
// ============================================================================

// Show the chatbot page - accessible from the profile page
// This is a career assistant chatbot powered by OpenAI
app.get("/chatbot", (req, res) => {
  res.render("chatbot", {
    isLoggedIn: req.session.isLoggedIn || false,
    userId: req.session.user?.id || null,
    role: req.session.user?.role || null,
  });
});

// Handle chatbot messages - receives user questions and returns AI responses
// Uses OpenAI's API to provide career guidance (résumés, applications, interviews, etc.)
app.post("/chatbot", async (req, res) => {
  const userMsg = req.body.message;

  // Make sure we got a valid message
  if (!userMsg || typeof userMsg !== "string") {
    return res.status(400).send({
      reply: "Please provide a valid message.",
    });
  }

  try {
    const { OpenAI } = require("openai");

    // Connect to OpenAI API (API key stored in environment variables)
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Send the user's message to OpenAI with a system prompt
    // The system prompt keeps the chatbot focused on career topics and safe content
    const completion = await client.chat.completions.create({
      model: "gpt-5-nano",
      messages: [
        {
          role: "system",
          content:
            "You are a safe, supportive career assistant for teenage girls in the Ella Rises program. You ONLY help with résumés, job applications, college applications, professional writing, interviewing, or general career skills. Avoid personal topics or anything unsafe.",
        },
        { role: "user", content: userMsg },
      ],
    });

    // Send the AI's response back to the frontend
    res.send({
      reply: completion.choices[0].message.content,
    });
  } catch (err) {
    console.error("Chatbot Error:", err);

    // If something goes wrong, send a friendly error message
    res.status(500).send({
      reply:
        "Sorry, I'm having trouble responding right now. Please try again in a moment!",
    });
  }
});

// Easter egg route - HTTP 418 "I'm a teapot" status code
app.get("/teapot", (req, res) => {
  res.status(418).send("I'm a teapot");
});

// START TO LISTEN (& tell command line)
app.listen(port, () => console.log("the server has started to listen"));
