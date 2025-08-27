# Reddit Post Hider

A browser extension that allows you to hide Reddit posts by clicking on them, with persistent storage, keyboard shortcuts, and enhanced user experience.

## Features

- **Click to Hide**: Simply click on any Reddit post to hide it
- **Persistent Storage**: Hidden posts remain hidden across browser sessions
- **Keyboard Shortcuts**: Use keyboard shortcuts for quick hiding
- **Enhanced UX**: Smooth animations and visual feedback

## Installation

1. Download or clone this repository
2. Open Chrome/Edge and go to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension folder
5. The Reddit Post Hider extension should now appear in your extensions list

## Usage

1. Navigate to any Reddit page
2. Click on posts you want to hide - they will fade out and be hidden
3. Use the extension popup to manage settings or view hidden posts
4. Hidden posts are automatically saved and will remain hidden on future visits

## Files

- `manifest.json` - Extension configuration and permissions
- `content.js` - Main content script that handles post hiding functionality
- `popup.html` - Extension popup interface
- `popup.js` - Popup functionality and settings management
- `styles.css` - Styling for the extension interface and animations

## Permissions

- `storage` - To save hidden posts persistently
- `activeTab` - To interact with Reddit pages
- `*://*.reddit.com/*` - To run on all Reddit domains

## Version

Current version: 2.0

## Browser Compatibility

This extension uses Manifest V3 and is compatible with:
- Chrome 88+
- Edge 88+
- Other Chromium-based browsers

## License

This project is open source. Feel free to contribute or modify as needed.