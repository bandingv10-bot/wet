// Main JavaScript File

// Smooth scroll behavior for navigation links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  });
});

// Add scroll animation to elements
const observerOptions = {
  threshold: 0.1,
  rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.style.animation = 'slideInUp 0.6s ease-out';
      observer.unobserve(entry.target);
    }
  });
}, observerOptions);

// Observe feature cards
document.querySelectorAll('.feature-card, .service-card').forEach(card => {
  observer.observe(card);
});

// Mobile menu toggle (if needed)
const hamburger = document.querySelector('.hamburger');
const navLinks = document.querySelector('.nav-links');

if (hamburger) {
  hamburger.addEventListener('click', () => {
    navLinks.classList.toggle('active');
  });
}

// Form validation
const contactForm = document.querySelector('.contact-form');
if (contactForm) {
  contactForm.addEventListener('submit', (e) => {
    const name = document.querySelector('input[name="name"]').value.trim();
    const email = document.querySelector('input[name="email"]').value.trim();
    const message = document.querySelector('textarea[name="message"]').value.trim();

    if (!name || !email || !message) {
      e.preventDefault();
      alert('Please fill in all fields');
    }
  });
}

// Add active state to current nav link
const currentLocation = location.pathname;
const menuItems = document.querySelectorAll('.nav-links a');

menuItems.forEach(item => {
  if (item.getAttribute('href') === currentLocation) {
    item.classList.add('active');
  }
});

// Animate numbers in stats (if present)
const animateValue = (element, start, end, duration) => {
  let startTimestamp = null;
  const step = (timestamp) => {
    if (!startTimestamp) startTimestamp = timestamp;
    const progress = Math.min((timestamp - startTimestamp) / duration, 1);
    element.textContent = Math.floor(progress * (end - start) + start);
    if (progress < 1) {
      window.requestAnimationFrame(step);
    }
  };
  window.requestAnimationFrame(step);
};

// Handle success message
if (window.location.search.includes('success=true')) {
  const message = document.createElement('div');
  message.className = 'success-message';
  message.textContent = '✓ Thank you! Your message has been sent successfully.';
  document.body.insertBefore(message, document.body.firstChild);
  
  setTimeout(() => {
    window.history.replaceState({}, document.title, window.location.pathname);
    message.remove();
  }, 5000);
}

console.log('🎉 Welcome to WET - Modern Web Application');
