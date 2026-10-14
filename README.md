# Equipment Borrowing System

A web-based application built for academic institutions to manage, track, and process requests for laboratory and school equipment.

## Tech Stack
* **Backend:** Node.js, Express.js
* **Frontend:** EJS (Embedded JavaScript), Bootstrap 5, HTML/CSS
* **Database:** SQLite
* **Authentication:** `express-session`, bcrypt

## Features
* **Student Dashboard:** View available inventory and submit borrow requests with specific dates.
* **Property Custodian (Admin) Panel:** Review pending requests, approve equipment checkouts, and mark items as returned.
* **Real-Time Status Tracking:** Prevents double-booking by automatically updating equipment availability when a request is approved.
* **Secure Sessions:** Role-based access control protecting admin routes and user data.

## Prerequisites
* [Node.js](https://nodejs.org/) (v14 or higher)
* Git

## Local Setup & Installation

1. **Clone the repository:**
   ```bash
   git clone [https://github.com/Jopschool/equipment-borrowing-system.git](https://github.com/Jopschool/equipment-borrowing-system.git)