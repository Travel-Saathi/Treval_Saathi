**TRAVEL SAATHI**

**README / Idea Document**

_Smart India Hackathon 2026_

**ProblemStatement ID:** SIH26204

**Theme:**Travel & Tourism

**Category:**Software

**Team:**D-NEXUS  (Team ID: OCT0232)

_Note: This document expandsthe team's SIH pitch into a fuller written record of the idea, approach andreasoning behind it. It is not a claim of a finished build._

**1\. The Idea**
================

Most travel apps arebuilt for planning a trip, not for what happens when the trip stops going toplan. Travel Saathi is a privacy-first travel companion that treats a journeyas something that keeps evolving, not a fixed plan you lock in at the start andhope holds.

It combines trip planningwith real-time event understanding, so when something changes - a delay, acancellation, a closure, bad weather - the traveller gets a workable next stepinstead of just a notification.

_**What it does**_
------------------

•     **Completejourney planning -** destinations,transport, hotels, activities, time and budget, all represented as oneconnected journey.

•     **Real-timeevent understanding -** the system reads disruption events such as delays, cancellations, weatherchanges, roadblocks and closures.

•     **Journeyimpact analysis -** ratherthan surfacing a bare alert, it works out which downstream parts of the tripthe disruption actually affects.

•     **Adaptiverecommendations -** alternativesare ranked on time, cost, distance, risk and the traveller's own preferences.

•     **Journeyrecovery mode -** rebuildsthe remaining itinerary after a missed connection or a major disruption.

•     **Travellerstays in control -** thesystem proposes; the traveller decides.

_**Where it fits**_
-------------------

•     Closesthe gap between planning a trip and actually living through it when things gowrong.

•     Traceshow one disruption ripples into later transport, hotel check-in, sightseeingand other plans.

•     Replacesan isolated alert with a set of comparable, actionable options.

•     Letstravellers weigh choices against real constraints - time, cost, distance,preference - instead of guessing.

**2\. Technical Approach**
==========================

The system is built as across-platform mobile app on top of a backend/data layer, external real-worlddata sources and an AI-assisted intelligence layer. AI handles eventinterpretation and generating recommendation candidates; deterministic systemlogic checks the hard constraints - time, distance, cost - before any option isshown to the user.

_**Core loop**_
---------------

PLAN -> DETECT CHANGE-> ANALYSE IMPACT -> GENERATE OPTIONS -> TRAVELLER CHOOSES ->UPDATE JOURNEY

_**Technology components**_
---------------------------

•     **Application:**React Native / Expowith TypeScript, for the cross-platform mobile experience.

•     **Backend& database:** Supabase/ PostgreSQL for storage, auth and backend services.

•     **Maps& location:** OpenStreetMapplus compatible routing/location services for search and route/distancecalculations.

•     **ExternalAPIs:** weather,maps/routing and places APIs supply real-world data.

•     **AI& intelligence:** anLLM interprets travel events, assesses impact and generates candidaterecommendations.

•     **Controllayer:** deterministicchecks validate time, distance and cost constraints before options reach theuser.

_**How the workflow operates**_
-------------------------------

•     **Plan-** traveller entersdestinations, dates, transport preferences, budget and planned activities.

•     **Detectchange -** systemreceives a relevant event - a train delay, cancellation, closure or weatherdisruption.

•     **Analyseimpact -** checkswhich upcoming journey elements depend on the affected event.

•     **Generateoptions -** producesalternatives - another connection, a shifted activity time, a nearby place towait.

•     **Travellerchooses -** userreviews the options and picks the one that fits their priorities.

•     **Updatejourney -** theremaining itinerary is rebuilt around that choice.

**3\. Feasibility and Viability**
=================================

_**Technical feasibility**_
---------------------------

•     Builton established mobile, database, mapping and API technologies.

•     Modulararchitecture - individual APIs and services can be swapped or extended as theproject grows.

•     OpenStreetMapand external APIs cover mapping, routing, weather and place data.

_**Financial feasibility**_
---------------------------

•     MVPleans on open-source and low-cost services wherever practical.

•     Cloudinfrastructure removes the need for upfront hardware investment.

•     APIusage and AI inference cost are the main ongoing operating expenses to watch.

_**Market feasibility**_
------------------------

•     Travellerscurrently juggle separate tools for planning, booking, navigation and statusupdates.

•     TravelSaathi targets the specific moment a planned journey breaks and the travellerneeds help adapting, not the whole booking stack.

•     Usefulacross tourists, solo travellers, families and groups.

_**Operational feasibility**_
-----------------------------

•     Differentdisruption types feed into one standardized adaptation workflow.

•     Modulardesign allows new data sources and services to be added over time.

**4\. Impact and Benefits**
===========================

_**Potential impact**_
----------------------

•     Context-aware,adaptive assistance improves the actual travel experience, not just theplanning phase.

•     Betterdecisions during delays, cancellations, closures and unexpected events.

•     Fewerwasted trips - practical alternatives instead of scrapped plans.

•     Discoveryopportunities for local hotels, restaurants, guides and tourism businesses.

_**Social, economic and environmental benefits**_
-------------------------------------------------

•     Timely,relevant travel information and more traveller control over decisions.

•     Groundworkfor safety and emergency-information features.

•     Supportslocal hotels, restaurants and guides by redirecting travellers during unplannedwaits.

•     Smarterrouting can cut avoidable detours and unnecessary travel.

_**Challenges / limitations**_
------------------------------

•     Recommendationquality depends entirely on how fresh and accurate the external data feeds are.

•     API,cloud and AI usage carry recurring operating costs.

•     Usersneed to trust the system's suggestions while still reviewing and choosing forthemselves.

•     Conditionson the ground can change faster than external data sources update.

**5\. Research and References**
===============================

This is a look at whatexisting travel platforms already do. Travel Saathi's differentiation is theworkflow and combination, not a claim that any single feature is unprecedented.

**Platform**

**What it provides**

**Overlap**

**Travel Saathi's focus**

IRCTC Tourism

Flights, buses, hotels, retiring rooms, tour packages and other tourism services.

Transport, accommodation and tourism services.

Journey-level adaptation after a disruption, including impact analysis and recovery choices.

Wanderlog

Itineraries, maps, route optimization, reservations, lodging, budgeting, flight status, collaboration, AI assistance.

Trip planning, route organization, status/recommendation features.

Treats a disruption as an event that triggers analysis of the remaining journey and alternative actions.

Google Maps

Directions, turn-by-turn navigation, real-time traffic information.

Maps, routing and real-time route conditions.

Connects journey-level context with disruption impact, planned activities and recovery decisions.

MakeMyTrip

Travel booking and trip-related services across transport and accommodation.

Travel booking and trip management.

Adaptive journey intelligence, rather than booking individual travel products.

_**Key research insight**_
--------------------------

Existing platformsalready cover booking, itinerary planning, navigation, accommodation andindividual status updates well. What Travel Saathi adds is a journey-stateprocess that ties these together: detect an event, analyse its downstreameffect, generate alternatives, let the traveller choose, update the remainingjourney.

_**Technical / academic references**_
-------------------------------------

•     ReactNative - reactnative.dev

•     OpenStreetMap- openstreetmap.org

•     Nominatim- nominatim.org/release-docs/latest

•     OpenAIAPI documentation - developers.openai.com/api/docs/models

•     ScienceDirectresearch reference listed in the original project material.

**6\. Unique Value Proposition**
================================

•     **Livingjourney state -** thejourney is treated as an evolving state, not a fixed plan.

•     **Journey-levelimpact analysis -** adisruption is evaluated for its knock-on effect on everything after it.

•     **Actionablealternatives -** thegoal is next steps, not just alerts.

•     **AI +deterministic intelligence -** AI handles event understanding and recommendation reasoning;critical calculations stay system-controlled.

•     **Traveller-in-control-** the systemrecommends, the traveller decides.

•     **Privacy-first-** built withoutrequiring unnecessary continuous exact-location tracking.

**Conclusion**
==============

Travel Saathi connectstrip planning with what actually happens on the road. It keeps context aboutthe rest of the journey, works out how a disruption affects it, and putspractical alternatives in front of the traveller, while leaving the final callto them. The idea rests on three things working together: real travel data,deterministic journey constraints, and AI-assisted reasoning.

**Document note:** _thisREADME expands the team's SIH PPT and idea document. Exact implementationdetails will follow the team's confirmed technical design._
