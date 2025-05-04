# Qlik Globe Flows Extension

An interactive 3D globe visualization extension for Qlik Sense that displays geographical flow data between origin and destination points.



https://github.com/user-attachments/assets/da0183ec-b517-4d87-9c52-78a79f7f6292



## Overview

The Qlik Globe Flows extension visualizes connections between geographical locations on an interactive 3D globe. It's designed to show relationships, transactions, or movements between different points on Earth with customizable visual properties.

## Features

- **Interactive 3D Globe**: Rotatable and zoomable globe with smooth animations
- **Flow Visualization**: Show connections between origin and destination points with customizable line width based on measures
- **Point Visualization**: Highlight origin and destination points with configurable styling
- **Size by Measure**: Option to size destination points based on measure values
- **Interactive Selection**: Select countries and points to highlight specific flows
- **Customizable Styling**: Extensive options for colors, sizes, opacities, and more
- **Responsive Design**: Adapts to different screen sizes and container dimensions
- **Performance Optimized**: Handles large datasets with point limits and visibility optimizations
- **Rich Tooltips**: Detailed information on hover with customizable appearance

## Installation

1. Download the latest release ZIP file from the [releases page](https://github.com/yourusername/qlik-globe-flows/releases)
2. In Qlik Sense QMC, go to **Extensions** and click **Import**
3. Select the downloaded ZIP file
4. The extension will be available in the Qlik Sense visualization library

## Usage

### Required Dimensions (6)

1. **Origin Latitude**: Latitude coordinates of the origin point
2. **Origin Longitude**: Longitude coordinates of the origin point
3. **Origin Name**: Name or identifier of the origin location
4. **Destination Latitude**: Latitude coordinates of the destination point
5. **Destination Longitude**: Longitude coordinates of the destination point
6. **Destination Name**: Name or identifier of the destination location

### Optional Measures (0-2)

1. **Flow Value**: Controls the width of flow lines (optional)
2. **Destination Value**: Controls the size of destination points when "Size Destination Points by Measure" is enabled (optional)

### Configuration Options

The extension provides comprehensive configuration options organized into different sections:

#### Globe Settings

- **Country Color**: Base color for countries
- **Country Hover Color**: Color when hovering over countries
- **Country Selection Color**: Color for selected countries
- **Enable Country Selection**: Toggle country selection functionality
- **Ocean Color**: Color for the ocean/background

#### Point Settings

- **Point Show Limit**: Maximum number of points to display for performance
- **Show Warning When Limited**: Display a warning when data is limited
- **Point Color**: Color for origin/destination points
- **Point Color Opacity**: Transparency of points
- **Origin Point Size**: Size of origin points
- **Point Border Settings**: Customize borders for origin and destination points
- **Size Destination Points by Measure**: Enable sizing destinations by measure values
- **Min/Max Destination Point Size**: Size range for destination points

#### Flow Settings

- **Flow Line Color**: Color for flow lines
- **Flow Line Opacity**: Transparency of flow lines
- **Base Line Width**: Minimum width for flow lines
- **Line Width Scale Factor**: Multiplier for line width based on measure

#### Zoom Settings

- **Minimum Zoom Scale**: Lower zoom limit
- **Maximum Zoom Scale**: Upper zoom limit
- **Initial Zoom Level**: Default zoom on load
- **Zoom Speed Factor**: Speed of zoom controls

#### Tooltip Settings

- **Appearance**: Background color and opacity
- **Base Text Style**: Color, size, and weight for dimension text
- **Measure Value Style**: Color, size, and weight for measure values
- **Spacing**: Padding settings
- **Border**: Border color, width, and radius
- **Shadow**: Shadow blur, spread, and opacity

## Data Format Example

Your data should contain the following fields:

| Origin Lat | Origin Long | Origin Name | Dest Lat | Dest Long | Dest Name | Flow Value | Dest Value |
|------------|-------------|------------|----------|-----------|-----------|------------|------------|
| 40.7128    | -74.0060    | New York   | 34.0522  | -118.2437 | Los Angeles | 1250      | 780        |
| 51.5074    | -0.1278     | London     | 48.8566  | 2.3522    | Paris     | 980        | 540        |
| ...        | ...         | ...        | ...      | ...       | ...       | ...        | ...        |

## Interaction

- **Drag**: Rotate the globe
- **Scroll/Pinch**: Zoom in/out
- **Click Country**: Select a country
- **Click Point**: Select an origin or destination point
- **Hover**: Display tooltip information
- **Zoom Controls**: Use the +/- buttons for precise zoom

## Performance Tips

- Set an appropriate **Point Show Limit** for your data size
- Enable **Show Warning When Limited** to be aware of data limitations
- For very large datasets, consider pre-filtering data before visualization
- Use Qlik Sense's filtering to focus on specific regions or time periods

## Browser Compatibility

This extension works on all modern browsers that support WebGL:
- Chrome
- Firefox
- Safari
- Edge

Mobile browsers are supported with touch interaction for rotation and zooming.

## Development

### Prerequisites

- Node.js and npm
- Qlik Sense Desktop or Server for testing

### Setup

1. Clone the repository:
```
git clone https://github.com/yourusername/qlik-globe-flows.git
```

2. Install dependencies:
```
npm install
```

3. Build the extension:
```
npm run build
```

4. Copy to Qlik Sense extension directory:
```
cp -r dist /path/to/qlik/extensions/
```

### Project Structure

- `qlik-globe-flows.js`: Main extension code
- `globeCoordinates.json`: World map data
- `d3.v7.js`: D3.js dependency
- `properties.js`: Extension property definitions

## License

[MIT License](LICENSE)

## Credits

- Built with [D3.js](https://d3js.org/)
- Uses [TopoJSON](https://github.com/topojson/topojson) for geographical data

## Support

For issues, feature requests, or contributions, please use the [GitHub Issues](https://github.com/yourusername/qlik-globe-flows/issues) page.

---

