# AI Sales Agent

## Project Description

This project is an AI Sales Agent application, designed to automate and enhance sales processes. It includes both a backend server for handling business logic and API requests, and a frontend client for user interaction.

## Features

- **Automated Sales Workflow**: Streamlines various stages of the sales pipeline.
- **Interactive User Interface**: A modern and responsive frontend for managing sales activities.
- **API-driven Backend**: Robust backend services for data management and AI model integration.
- **Meeting Scheduling**: Integrated functionality for scheduling meetings.
- **User Authentication**: Secure authentication for users.

## Technologies Used

### Frontend

- React.js
- CSS (for styling)

### Backend

- Node.js
- Express.js

## Setup Instructions

Follow these steps to set up and run the AI Sales Agent application locally.

### 1. Clone the Repository

```bash
git clone https://github.com/killin24/ai-agent-eli-bot.git
cd ai-agent-eli-bot
```

### 2. Backend Setup

Navigate to the `backend` directory and install the dependencies:

```bash
cd backend
npm install
```

#### Environment Variables

Create a `.env` file in the `backend` directory and add the necessary environment variables. An example might look like this:

```
PORT=3001
MONGO_URI=mongodb://localhost:27017/aisalesagent
```

### 3. Frontend Setup

Navigate to the `frontend/ai-sales-frontend` directory and install the dependencies:

```bash
cd ../frontend/ai-sales-frontend
npm install
```

#### Environment Variables

Create a `.env.local` file in the `frontend/ai-sales-frontend` directory and add the necessary environment variables. An example might look like this:

```
REACT_APP_BACKEND_URL=http://localhost:3001
```

## Running the Application

### 1. Start the Backend Server

From the `backend` directory, run:

```bash
npm start
```

The backend server will start on the port specified in your `.env` file (e.g., `http://localhost:3001`).

### 2. Start the Frontend Application

From the `frontend/ai-sales-frontend` directory, run:

```bash
npm start
```

The frontend application will open in your browser, typically at `http://localhost:3000`.

## Contribution

Feel free to fork the repository and contribute. Please ensure your code adheres to the existing style and conventions.

## License

This project is licensed under the MIT License.
