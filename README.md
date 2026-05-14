# WET - Modern Web Application 🌟

A beautiful, smooth, and responsive web application with modern UI/UX design. No more boring boxy layouts!

## ✨ Features

- **Beautiful Design** - Modern, smooth, gradient-based UI
- **Responsive Layout** - Works perfectly on all devices (desktop, tablet, mobile)
- **Smooth Animations** - CSS transitions and scroll effects
- **Professional Styling** - Rounded corners, shadows, and elegant color schemes
- **Fast Performance** - Optimized for speed and smooth interactions
- **4 Pages** - Home, About, Services, and Contact pages
- **Contact Form** - Working form with validation
- **SEO Friendly** - Semantic HTML and meta tags

## 📁 Project Structure

```
wet/
├── public/
│   ├── css/
│   │   ├── style.css          # Main styles (900+ lines)
│   │   └── responsive.css     # Mobile responsive styles
│   └── js/
│       └── main.js            # Interactive features
├── views/
│   ├── index.ejs              # Home page
│   ├── about.ejs              # About page
│   ├── services.ejs           # Services page
│   └── contact.ejs            # Contact page
├── server.js                  # Express server
├── package.json               # Dependencies
└── README.md                  # This file
```

## 🚀 Quick Start

### Prerequisites
- Node.js (v14 or higher)
- npm (comes with Node.js)

### Installation

1. Clone or navigate to the repository:
```bash
cd wet
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm start
```

4. Open your browser and visit:
```
http://localhost:3000
```

### Development Mode

To auto-reload on file changes, install nodemon:
```bash
npm install --save-dev nodemon
npm run dev
```

## 🎨 Design Features

### Colors
- **Primary Gradient**: Purple to Pink (`#667eea` → `#764ba2`)
- **Secondary Gradient**: Pink to Red (`#f093fb` → `#f5576c`)
- **Light Background**: `#f7fafc`
- **Dark Background**: `#1a202c`

### Smooth Elements
- Animated navigation with underline effects
- Smooth scrolling behavior
- Hover effects on all interactive elements
- Gradient backgrounds and text
- Shadow effects for depth
- Rounded corners (20px default)

### Responsive Breakpoints
- **Large screens**: 1024px+
- **Tablets**: 768px - 1023px
- **Mobile**: 480px - 767px
- **Ultra-small**: 320px - 479px

## 📄 Pages

### Home (index.ejs)
- Hero section with CTA buttons
- 6 feature cards showcasing benefits
- Modern, eye-catching design

### About (about.ejs)
- Company information
- 6 value propositions
- Strengths section with 6 key points

### Services (services.ejs)
- 6 service offerings
- Detailed service descriptions
- 6-step process breakdown
- Call-to-action section

### Contact (contact.ejs)
- Contact form with validation
- Alternative contact methods (email, phone, address)
- Social media links

## 🔧 Technologies Used

- **Backend**: Node.js with Express
- **Templating**: EJS
- **Styling**: CSS3 with gradients, transitions, and animations
- **Scripting**: Vanilla JavaScript
- **Responsive Design**: Mobile-first CSS media queries

## 📝 Form Handling

The contact form:
- Validates required fields (name, email, message)
- Sends data to the server via POST request
- Displays success message on submission
- Redirects back to home page

## 🎯 Customization

### Change Colors
Edit the CSS variables in `public/css/style.css`:
```css
:root {
  --primary: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  --secondary: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
  /* ... more variables */
}
```

### Add More Pages
1. Create a new `.ejs` file in `views/`
2. Add a new route in `server.js`
3. Link it in the navigation

### Modify Styling
- Main styles: `public/css/style.css`
- Responsive styles: `public/css/responsive.css`
- Add new styles using the CSS variables for consistency

## 🐛 Browser Support

- Chrome (latest)
- Firefox (latest)
- Safari (latest)
- Edge (latest)
- Mobile browsers (iOS Safari, Chrome Mobile)

## 📱 Mobile Optimization

- Fully responsive design
- Touch-friendly buttons and links
- Optimized font sizes for mobile
- Flexible grid layouts
- Proper viewport meta tag

## ⚡ Performance

- Minimal external dependencies
- Optimized CSS selectors
- Smooth animations using CSS transforms
- Lazy loading support
- Mobile-first approach

## 📦 Deployment

Ready to deploy? Options include:
- **Heroku**: `git push heroku main`
- **Vercel**: Connect your GitHub repository
- **Railway**: Connect and deploy
- **DigitalOcean App Platform**: Deploy from GitHub
- **Any Node.js hosting**: npm install && npm start

## 📄 License

MIT License - Feel free to use this project for personal or commercial purposes.

## 👨‍💻 Author

Created with ❤️ by **bandingv10-bot**

## 🙏 Support

If you have any questions or issues, feel free to reach out through the contact form or email.

---

**Enjoy building beautiful web applications with WET!** 🚀✨
