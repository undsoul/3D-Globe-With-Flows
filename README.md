# Qlik Globe Flows Extension

Qlik Globe Flows is an interactive Qlik Sense extension that brings your geographic data to life with an animated 3D globe visualization. Built with D3.js and integrated with Qlik’s APIs, this extension displays dynamic flows between geographic locations through smooth animations, interactive selections, and customizable visual properties.

![Globe Overview](images/screenshot1.png)

## Features

- **Animated Globe Visualization**  
  - Renders a realistic 3D globe using an orthographic projection.  
  - Smooth initial animation from a starting position to a natural view.  
  - Supports panning and zooming with touch-friendly controls.

- **Dynamic Flow Lines**  
  - Curved great circle arcs connect origin and destination points.  
  - Flow measure controls the thickness of the lines, emphasizing stronger connections.  
  - Only draws visible portions of flows to maintain clarity.  [oai_citation:0‡qlik-globe-flows.js](file-service://file-19vVHXUSDjDN2hgFowmMZP)

- **Interactive Data Points and Country Selection**  
  - Plots both origin and destination points with interactive hover and click events.  
  - Hovering displays tooltips with detailed information.  
  - Clicking on a point triggers a selection and highlights the corresponding country and flows.

- **Zoom and Pan Controls**  
  - Includes zoom in, zoom out, and reset view buttons.  
  - Designed for both desktop and touch devices for a responsive experience.

- **Efficient Data Handling**  
  - Loads data in chunks from Qlik’s backend API.  
  - Displays a progress indicator during data loading.  
  - Optionally warns users when the displayed data exceeds a set limit.

![Flow Lines and Points](images/screenshot2.png)

## Dimensions and Measures

### Required Dimensions (6)
1. **Origin Latitude**  
   Numeric value specifying the latitude of the origin point.
2. **Origin Longitude**  
   Numeric value specifying the longitude of the origin point.
3. **Origin Name**  
   Text field for the origin location’s name (used for country identification).
4. **Destination Latitude**  
   Numeric value specifying the latitude of the destination point.
5. **Destination Longitude**  
   Numeric value specifying the longitude of the destination point.
6. **Destination Name**  
   Text field for the destination location’s name.

### Optional Measures (0 to 2)
1. **Flow Measure**  
   Controls the width of the flow lines. A larger value increases the line thickness, indicating a stronger flow.
2. **Destination Sizing Measure (Optional)**  
   When enabled, scales destination point sizes based on aggregated values, emphasizing destinations with higher significance.

## Property Panel Overview

The property panel is organized into accordion sections that let you customize every aspect of the visualization:

- **Globe Settings**
  - Customize country colors for default, hover, and selection states.
  - Adjust the ocean’s color to match your visual style.

- **Point Settings**
  - Configure size and appearance of origin and destination points.
  - Set border color, width, and opacity for both point types.
  - Define a maximum number of points to display, with an optional warning message if exceeded.

- **Flow Settings**
  - Adjust flow line appearance with customizable base color, opacity, and width scaling factor.
  - The flow measure directly influences the thickness of these lines.

- **Zoom Settings**
  - Set initial zoom level and define minimum and maximum zoom scales.
  - Adjust the zoom speed factor to control the interactivity.

- **Tooltip Settings**
  - Fully style tooltips with options for background color, text color, padding, font size, and border settings.
  - Separate styling options for dimension text and measure values ensure clarity.

## Source Code

For detailed implementation, please see the source files:
- [qlik-globe-flows.js](#) 
- [style.css](#)  

---

Feel free to fork, modify, and contribute to enhance this extension’s capabilities for your Qlik Sense applications!
