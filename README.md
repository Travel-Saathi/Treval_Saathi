# Travel Saathi

An intelligent travel assistance platform designed to make travel planning and journey management easier and more flexible.

## About the Project

**Travel Saathi** is a travel companion that manages, monitors, and adapts journeys to real-time changes while connecting travellers along the same route. It brings essential travel information such as routes, transportation, nearby hotels, and tourist attractions together in one place.

The platform is designed to assist travelers not only while planning their journey but also when **unexpected situations arise during travel**, helping them explore suitable alternatives and make informed decisions.

## Problem Statement

Travel plans can be unexpectedly disrupted due to **train delays, cancellations, route changes, road closures, or other unforeseen situations**. In such cases, travelers may struggle to quickly find alternative routes, transportation, accommodation, or nearby places.

Existing travel platforms mainly focus on journey planning, while handling these **unexpected changes during a journey** often requires searching across multiple sources.

Travel Saathi addresses this gap by providing **adaptive travel assistance and suitable alternatives when travel plans are disrupted**.

## Proposed Solution

Travel Saathi provides an **adaptive travel assistance system** that connects trip planning with real-world changes during a journey.

When a disruption such as a **train delay, cancellation, or route change** occurs, the system analyses its impact on the traveller's remaining journey and generates suitable alternatives based on factors such as **time, cost, distance, and preferences**. The traveller can choose an option, after which the remaining journey is updated accordingly.

Nearby hotels, tourist attractions, or activity alternatives can also be suggested when a disruption creates additional waiting time.

## Key Features

- **Smart Trip Planning** – Plan destinations, transport, stays, and activities in one place.
- **Real-Time Disruption Handling** – Detect delays, cancellations, route changes, and other unexpected situations.
**Connected Travellers** – Share relevant updates with travellers on the same route, trip, train, or transport.
- **Journey Impact Analysis** – Understand how a disruption affects the remaining trip.
- **Alternative Suggestions** – Get suitable options based on time, cost, distance, and preferences.
- **Nearby Recommendations** – Find useful hotels and tourist places during unexpected waiting time.
- **Adaptive Journey Updates** – Adjust the remaining journey after the traveller selects an alternative.
- **Traveller-in-Control** – Provides options while keeping the final decision with the traveller.
- **Privacy-Focused Assistance** – Provides assistance without unnecessary continuous location tracking.

## How It Works

1. **Plan** – The traveller enters destinations, dates, transport preferences, budget, and planned activities.
2. **Detect Change** – The system detects a relevant event such as a train delay, cancellation, closure, or other disruption.
3. **Analyse Impact** – The system identifies how the disruption affects the remaining journey, including upcoming transport, stays, and activities.
4. **Generate Options** – The system generates practical alternatives based on factors such as time, cost, distance, and traveller preferences.
5. **Traveller Chooses** – The traveller reviews the available options and selects the one that best suits their needs.
6. **Update Journey** – The remaining journey is updated according to the selected option.

**Overall Workflow:**  
**Plan → Monitor → Detect Change → Analyse Impact → Connect Relevant Travellers → Suggest → Traveller Chooses → Adapt**

## Technology Stack

- **Frontend:** React Native with Expo and TypeScript for building the mobile application.
- **Backend & Database:** Supabase with PostgreSQL for storing and managing application data.
- **Maps & Location:** OpenStreetMap and routing services for maps, locations, and route information.
- **External APIs:** Weather, places, and routing APIs to bring real-world travel information into the application.
- **AI & Intelligence:** Decision Logic: Evaluates time, cost, distance and journey constraints.
AI/LLM: Helps interpret information and generate explanations/recommendations where required.
- **Decision Logic:** Rule-based calculations to check factors like time, distance, cost, and journey constraints before showing recommendations.

## System Architecture

Travel Saathi follows a modular architecture where the mobile application connects with backend services, external travel-data sources, and AI-based intelligence.

- **Mobile Application** – React Native with Expo and TypeScript provides the user interface for planning and managing trips.
- **Backend & Database Layer** – Handles application logic and stores journey-related data using Supabase/PostgreSQL.
- **External Data & APIs** – Provides maps, routes, places, and other real-world travel information through integrated services.
- **AI Intelligence Layer** – Helps understand travel-related events and generate suitable recommendation options.
- **Decision & Control Layer** – Validates factors such as time, distance, cost, and other journey constraints before presenting options to the traveller.

**Architecture Flow:**  
**Mobile App → Backend & Database → External APIs / AI Layer → Journey Intelligence & Traveller Network → Decision & Control → Updated Travel Options**

## Installation & Setup

Follow the steps below to set up Travel Saathi locally.

### 1. Clone the Repository

Clone the project repository and open the project directory.

```bash
git clone https://github.com/Travel-Saathi/Treval_Saathi
cd Treval_Saathi
```

### 2. Set Up the Frontend

Navigate to the frontend folder and install the required dependencies.

```bash
cd frontend
npm install
```

Create a `.env` file inside `frontend` and add the required configuration for:

- Clerk authentication
- Supabase URL and key
- Backend URL
- Map configuration

### 3. Set Up the Backend

Open a new terminal, navigate to the backend folder, and install the dependencies.

```bash
cd backend
npm install
```

Create a `.env` file inside `backend` and configure:

- Geoapify API key
- Serper API key
- OpenRouter API key
- OSRM server
- OpenSERP
- Web search settings
- Backend port

### 4. Configure External Services

Travel Saathi uses the following services:

| Service | Purpose |
|---|---|
| **Clerk** | User authentication |
| **Supabase** | Database and backend data management |
| **Geoapify** | Places and location data |
| **Serper** | Web search |
| **OpenRouter** | AI/LLM services |
| **OSRM** | Routing and distance calculation |
| **OpenSERP** | Self-hosted web search |

Create the required accounts and API keys for the services that require them. OSRM uses the configured public server and does not require an API key.

### 5. Configure Supabase

Create a Supabase project and set up the required database tables, authentication, and policies.

Add the Supabase URL and key to the frontend `.env` file.

### 6. Run the Application

Start the backend:

```bash
cd backend
node server.js
```

Start the frontend:

```bash
cd frontend
npx expo start
```

The application can be run using an Android Emulator or Expo Go on a physical device.

## Usage

1. **Create an Account** – Sign in to Travel Saathi using the authentication system.
2. **Plan Your Trip** – Enter destinations, travel dates, transport preferences, budget, and planned activities.
3. **Monitor the Journey** – The system uses available travel information to identify relevant changes or disruptions.
4. **Review Alternatives** – When a disruption affects the journey, Travel Saathi provides suitable options based on factors such as time, cost, distance, and preferences.
5. **Choose an Option** – Select the alternative that best fits your needs.
6. **Continue the Updated Journey** – The remaining travel plan is adjusted according to the selected option.

## APIs & External Services

Travel Saathi integrates multiple external services to provide authentication, data, routing, search, and AI capabilities.

| Service | Purpose |
|---|---|
| **Clerk** | User authentication and account management |
| **Supabase** | Database and backend data management |
| **Geoapify** | Location and place-related data |
| **Serper** | Web search and real-time information retrieval |
| **OpenRouter** | AI/LLM-based processing and recommendations |
| **OSRM** | Route and distance calculation |
| **OpenSERP** | Self-hosted web search |

These services work together to provide the travel information and intelligence required for adaptive journey assistance.

## Future Scope

- **Expanded Transport Integration** – Add cabs, local transport, and more travel modes.
- **Offline Travel Support** – Provide essential journey information without internet connectivity.
- **Voice-Based Travel Assistant** – Allow travellers to interact with the system through voice commands.
- **Regional Language Support** – Add more Indian languages for wider accessibility.
- **Emergency & Safety Assistance** – Provide quick access to emergency services and safety information.
- **Group Trip Planning** – Enable multiple travellers to plan and manage a shared journey.
- **International Traveller Support** – Support foreign travellers with local transport, currency, language, and essential services.
- **Traveller Connectivity** – Allow travellers to share useful updates and information with each other.

## Team & Contributions

| Team Member | Contribution |
|---|---|
| **Ravi Tripathi** | Worked on the app frontend, backend integration, database, and authentication system. |
| **Shreyansh Sharma** | Worked on the backend, real-time data integration, and AI-based recommendation system. |
| **Ritesh Kumar** | Contributed to user surveys, team coordination, and project testing. |
| **Prachi Singh** | Worked on project research and documentation. |
| **Sachin Nagwanshi** | Worked on maps integration and connected various APIs with the project. |
| **Muskan Sharma** | Supported the team across different project tasks and activities. |
