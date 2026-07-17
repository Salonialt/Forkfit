# ForkFit – AI-Powered Smart Nutrition Assistant

## Overview

ForkFit is an AI-powered nutrition assistant that helps users make healthier food choices through image recognition, calorie estimation, personalized meal planning, and grocery assistance. Users can upload a photo of their meal to receive nutritional insights and AI-driven recommendations based on their health goals.

The platform combines computer vision, large language models, and nutrition data to deliver an intelligent and personalized diet management experience.

---

# Features

### AI Food Recognition

* Detects food items from uploaded images.
* Identifies multiple foods within a single meal.
* Estimates serving sizes and nutritional values.

### Nutrition Analysis

* Calories
* Protein
* Carbohydrates
* Fat
* Fiber
* Sugar
* Sodium
* Confidence score for predictions

### Personalized Meal Planning

* Goal-based meal recommendations
* Weight loss plans
* Muscle gain plans
* Balanced nutrition suggestions
* Daily calorie tracking

### Daily Health Tracking

* Water intake logging
* Food history
* Nutrition dashboard
* Meal history

### Smart Grocery Assistant *(Planned)*

* Generate grocery lists from meal plans.
* One-click integration with grocery delivery platforms.
* Automatically add grocery items to shopping carts.
* Suggest in-stock alternatives when products are unavailable.

### 📈 Dashboard

* Daily calorie summary
* Macronutrient distribution
* Nutrition history
* Progress tracking

---

# Tech Stack

## Frontend

* React
* JavaScript
* HTML5
* CSS3
* Tailwind CSS

## Backend

* FastAPI
* Python

## Database

* MongoDB

## AI & Machine Learning

* Computer Vision
* Large Language Models (LLMs)
* Nutrition Dataset Integration
* AI-based Food Analysis

## Authentication

* JWT Authentication

---

# Project Structure

```text
fork_fit/
│
├── backend/
│   ├── server.py
│   ├── requirements.txt
│   ├── routes/
│   ├── models/
│   └── services/
│
├── frontend/
│   ├── src/
│   ├── public/
│   └── package.json
│
├── .gitignore
├── README.md
└── LICENSE
```

---

# Installation

## Clone the Repository

```bash
git clone https://github.com/<your-username>/fork_fit.git
cd fork_fit
```

---

## Backend Setup

Create a virtual environment:

```bash
python -m venv .venv
```

Activate it:

### macOS / Linux

```bash
source .venv/bin/activate
```

### Windows

```bash
.venv\Scripts\activate
```

Install dependencies:

```bash
pip install -r backend/requirements.txt
```

Create a `.env` file inside the `backend` folder and add your environment variables.

Start the backend server:

```bash
cd backend
uvicorn server:app --reload
```

---

## Frontend Setup

```bash
cd frontend
npm install
npm start
```

---

# Environment Variables

Example:

```env
MONGO_URL=your_mongodb_connection_string
DB_NAME=forkfit
JWT_SECRET=your_secret_key

GROQ_API_KEY=your_groq_api_key
```

---

# Future Roadmap

* Barcode scanning
* Restaurant menu nutrition analysis
* Wearable device integration
* Voice assistant
* AI fitness coach
* Grocery platform integration
* Personalized micronutrient recommendations
* Weekly nutrition reports
* OCR-based nutrition label reading

---

# Screenshots

Add application screenshots here.

Example:

```
screenshots/
├── login.png
├── dashboard.png
├── food-analysis.png
├── meal-plan.png
```

---

# Contributing

Contributions are welcome.

1. Fork the repository
2. Create a feature branch

```bash
git checkout -b feature/your-feature
```

3. Commit your changes

```bash
git commit -m "Add your feature"
```

4. Push to your branch

```bash
git push origin feature/your-feature
```

5. Open a Pull Request.

---

# Author

**Saloni-Mahajan**

GitHub: https://github.com/Salonialt

---

## Acknowledgements

* FastAPI
* React
* MongoDB
* Tailwind CSS
* Groq
* Open-source AI and nutrition datasets
