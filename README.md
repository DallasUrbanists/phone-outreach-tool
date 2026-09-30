# Phone Outreach Tool

A fast, lightweight, and privacy-focused client-side web application designed for community organizers, campaign volunteers, and outreach teams. Easily import contacts, compose personalized SMS templates with dynamic tags, and conduct 1-on-1 SMS outreach directly from your browser or mobile device.

[**🌐 GO TO ONLINE TOOL NOW**](https://dallasurbanists.github.io/phone-outreach-tool/)

## 🚀 Features

**Multi-Format Contact Import**
- Drag-and-drop or select `.csv`, `.xlsx`, and `.xls` files (powered by [SheetJS](https://sheetjs.com/)).
- Manual copy-paste support for raw CSV rows or plain phone number lists.
  
**Intelligent Column Mapping**
- Automatic column detection and toggleable header row recognition.
- Flexible mapping for First Name, Last Name, Full Name, Phone Number, and Email.

**Personalized Message Templating**
- Dynamic template placeholder tags: `{first_name}`, `{last_name}`, `{full_name}`, and `{email}`.
- Quick-insert variable pills and live message preview for the first contact.

**Outreach Dashboard & Tracking**
- One-click native `sms:` links to launch your device's default messaging app with pre-filled text.
- Real-time outreach progress bar and counter.
- Filter by All / Unsent contacts and instant search by name or phone.
- Ignore/restore contacts and batch actions (Select All, Copy selected emails).
- Fullscreen expandable list view optimized for mobile and desktop screens.

**100% Client-Side & Private**
- No server backend or external database. All contact data stays securely in your browser.
- Automatic state persistence via `localStorage` so you never lose your place on page reload.

## 🛠️ Built With

- **HTML5 & Vanilla JavaScript (ES6+)**
- **[Bootstrap 5](https://getbootstrap.com/)** – UI components and responsive styling
- **[Bootstrap Icons](https://icons.getbootstrap.com/)** – Action and navigation icons
- **[SheetJS (xlsx)](https://sheetjs.com/)** – Client-side spreadsheet parsing


## 💻 Developer Guide

### Prerequisites

- Git
- Node JS
- NPM

### Running Locally

1. **Clone the repository:**
   ```bash
   git clone https://github.com/DallasUrbanists/phone-outreach-tool.git
   cd phone-outreach-tool
   ```

2. **Start a local development server:**
   ```bash
   npm run dev
   ```
   *Alternatively, you can open `index.html` directly in your web browser or use VS Code's Live Server extension.*


## 📖 How It Works

1. **Upload or Paste Contacts:** Provide a CSV/Excel file or paste contacts directly.
2. **Map Columns:** Choose which columns correspond to contact names, phone numbers, and optional emails.
3. **Draft Message:** Write your message template and insert dynamic placeholder tags.
4. **Send & Track:** Tap SMS buttons to text each contact, mark progress, and manage outreach lists.


## 📄 License

This project is licensed under the [ISC License](LICENSE).
```