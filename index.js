
// PROFILE DELETE ROUTE (called from profile page)
app.post("/profile-delete/:table/:id", async (req, res) => {
    const { table, id } = req.params;

    const primaryKeyByTable = {
        users: "user_id",
        milestones: "milestone_id",
        events: "event_id",
        survey_results: "survey_id",
        donations: "donation_id",
        event_registrations: "event_registration_id",
    };

    const primaryKey = primaryKeyByTable[table];

    try {
        // Special handling for deleting the user's own account (participants table)
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
                    redirect: "/"
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

    let query = knex("users");

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

    let query = knex("users");
    
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
        // ðŸ” if your join table has a different name, update "event_registrations" + its cols
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
            .join("users as p", "m.user_id", "p.user_id")
            .select(
                "m.milestone_id",
                "m.user_id",
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
            .join("users as p", "er.user_id", "p.user_id")
            .join("events as e", "er.event_id", "e.event_id")
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
