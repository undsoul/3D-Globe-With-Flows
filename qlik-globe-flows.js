define(['qlik', 'jquery', 'text!./globeCoordinates.json','./d3.v7'], function(qlik, $, worldJson,d3) {
    'use strict';
    // Add these CSS rules at the beginning of your paint function
    const styleElement = document.createElement('style');
    styleElement.textContent = `
        .qv-extension-qlik-globe {
            width: 100%;
            height: 100%;
            min-height: 400px;
            position: relative;
            overflow: hidden;
        }
        .qv-extension-qlik-globe svg {
            width: 100%;
            height: 100%;
            display: block;
        }
    `;
    document.head.appendChild(styleElement);

    const worldData = JSON.parse(worldJson);

    const ANIMATION_STATE = {
        hasAnimated: new Set()
    };

    let lastK = 2; // Initial Zoom    
    let layers = null; // Initialize layers at module scope
    //let projection = null; // Initialize projection at module scope 

    // First, modify how we store the selection state
    // At the top of the file, with other global declarations
    let globalSelectionState = {
        countries: new Set(),
        lastPoint: null,
        selectedOrigin: null,
        selectedDestinations: new Set()
    };

    let selectedOrigin = null;  // Add this line
    let selectedDestinations = new Set();  // Add this line
    let currentState = {
        scale: null,
        rotation: null
    };

    function isVisible(latitude, longitude, projection) {
        // Get current rotation
        const rotate = projection.rotate();
        
        // Convert rotation to radians
        const λ = (-rotate[0] * Math.PI) / 180; // Lambda (longitude)
        const φ = (-rotate[1] * Math.PI) / 180; // Phi (latitude)
        
        // Convert point coordinates to radians
        const pointλ = (longitude * Math.PI) / 180;
        const pointφ = (latitude * Math.PI) / 180;
        
        // Calculate cosine of great circle distance
        const cosDistance = Math.sin(φ) * Math.sin(pointφ) +
            Math.cos(φ) * Math.cos(pointφ) * Math.cos(λ - pointλ);
        
        // Point is visible if it's on the front half of the globe
        return cosDistance > 0;
    }

    function hideLoadingIndicator() {
        const loadingDiv = document.getElementById('globe-loading');
        if (loadingDiv) {
            loadingDiv.remove();
        }
    }     


    function processPoints(flows) {
        // First collect all points that can be origins
        const allPoints = new Map();
        
        flows.forEach(flow => { 
            
            const originKey = `${flow.origin.latitude},${flow.origin.longitude}`;
            allPoints.set(originKey, {
                ...flow.origin,
                isOrigin: true
            });
            
            // Add destinations without overwriting origin status
            const destKey = `${flow.destination.latitude},${flow.destination.longitude}`;
            const existing = allPoints.get(destKey);
            if (!existing) {
                allPoints.set(destKey, {
                    ...flow.destination,
                    isOrigin: false,
                    totalValue: flow.destValue || 0
                });
            } else if (!existing.isOrigin) {
                existing.totalValue = (existing.totalValue || 0) + (flow.destValue || 0);
            }
        });

    return Array.from(allPoints.values());
    }

    const pathCache = new Map();

    function createFlowLine(source, target, projection) {
        const scale = projection.scale();
        const cacheKey = `${source.latitude},${source.longitude}-${target.latitude},${target.longitude}-${projection.rotate().join(',')}-${scale}`;
        
        if (pathCache.has(cacheKey)) {
            return pathCache.get(cacheKey);
        }
        
        // Validate input coordinates
        if (!source || !target || 
            typeof source.latitude !== 'number' || 
            typeof source.longitude !== 'number' ||
            typeof target.latitude !== 'number' || 
            typeof target.longitude !== 'number') {
            return null;
        }
    
        // Check if points are within valid ranges
        if (Math.abs(source.latitude) > 90 || Math.abs(target.latitude) > 90 ||
            Math.abs(source.longitude) > 180 || Math.abs(target.longitude) > 180) {
            return null;
        }
    
        // Create a great circle generator
        const greatCircle = d3.geoInterpolate(
            [source.longitude, source.latitude],
            [target.longitude, target.latitude]
        );
    
        // Generate points along the great circle
        const numPoints = 100;
        const points = Array.from({ length: numPoints }, (_, i) => {
            const t = i / (numPoints - 1);
            return greatCircle(t);
        });
    
        // Filter visible portions of the path
        const visiblePoints = points.filter(point => {
            return isVisible(point[1], point[0], projection);
        });
    
        // If no visible points, don't render the path
        if (visiblePoints.length === 0) {
            return null;
        }
    
        // Create a line generator for the curved path
        const lineGenerator = d3.line()
            .x(d => projection(d)[0])
            .y(d => projection(d)[1])
            .curve(d3.curveBundle.beta(0.3));
    
        // Generate the path with intermediate points for proper curvature
        const path = lineGenerator(visiblePoints);
    
        pathCache.set(cacheKey, path);
        return path;
    }

    function clearPathCache() {
        if (pathCache.size > 1000) pathCache.clear();
    }

    // Add this at the top level of your code where other utilities are defined
    function showProgressIndicator($element, progress) {
        let loadingDiv = document.getElementById('globe-loading');
        
        if (!loadingDiv) {
            loadingDiv = document.createElement('div');
            loadingDiv.id = 'globe-loading';
            loadingDiv.style.cssText = `
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                background: rgba(255,255,255,0.9);
                padding: 20px;
                border-radius: 5px;
                box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                z-index: 1000;
                text-align: center;
            `;
            $element.append(loadingDiv);
        }
        
        loadingDiv.innerHTML = `
            <div>Loading data...</div>
            <div style="margin-top: 10px; font-size: 12px;">
                ${progress} points loaded
            </div>
        `;
    }
    
    async function getAllData(component, $element, layout) {  // Add layout parameter
        const CHUNK_SIZE = 1000;
        
        // Use layout parameter instead of component.layout
        const pointLimit = layout?.props?.pointShowLimit || 1000;
        let rows = [];
        
        const getMoreData = async () => {
            // Show loading progress
            showProgressIndicator($element, rows.length);
            
            // Check if we've hit the limit
            if (rows.length >= pointLimit) {
                hideLoadingIndicator();
                return rows;
            }
    
            try {
                const page = await component.backendApi.getData([{
                    qTop: rows.length,
                    qLeft: 0,
                    qWidth: 8,
                    qHeight: Math.min(CHUNK_SIZE, pointLimit - rows.length)
                }]);
    
                if (page && page[0] && page[0].qMatrix.length > 0) {
                    rows.push(...page[0].qMatrix);
                    
                    // If we haven't reached the limit and there's more data, continue
                    if (rows.length < pointLimit && page[0].qMatrix.length === CHUNK_SIZE) {
                        return await getMoreData();
                    }
                }
                
                hideLoadingIndicator();
                return rows;
                
            } catch (error) {
                console.error('Error getting data:', error);
                hideLoadingIndicator();
                throw error;
            }
        };
    
        return await getMoreData();
    }

    
    function animateGlobe(targetRotation, targetScale, duration = 1000) {
        const currentRotation = projection.rotate();
        const currentScale = projection.scale();
        
        // Mevcut animasyonu durdur
        svg.transition().interrupt();
        
        return d3.transition()
            .duration(duration)
            .ease(d3.easeCubicInOut)
            .tween("rotate-and-zoom", () => {
                const rotationInterpolator = d3.interpolate(currentRotation, targetRotation);
                const scaleInterpolator = d3.interpolate(currentScale, targetScale);
                
                return t => {
                    const scale = scaleInterpolator(t);
                    projection.rotate(rotationInterpolator(t))
                             .scale(scale);
                    
                    layers.ocean.select("circle").attr("r", scale);
                    layers.countries.selectAll("path").attr("d", path);
                    updateFlows();
                    updateZoomIndicator(scale);
                    updateVisualState();
                };
            });
    }
    

    // Update the updateCountryColors function
    function updateCountryColors(selectedPoint, layers, layout, worldData) {
        if (!selectedPoint || !layers || !layout || !worldData) return;
    
        // First clear all colors and selection states
        layers.countries.selectAll("path")
            .attr("fill", layout.props.countryColor.color)
            .attr("data-selected", "false");
        
        globalSelectionState.countries.clear(); // Clear the selection state

        const selectedCountry = worldData.features.find(feature => 
            d3.geoContains(feature, [selectedPoint.longitude, selectedPoint.latitude])
        );
    
        if (selectedCountry) {
            const countryName = selectedCountry.properties.name;
            
            // Then update state and colors only for the newly selected country
            if (!selectedPoint.deselect) {
                globalSelectionState.countries.add(countryName);
            }
            globalSelectionState.lastPoint = selectedPoint;
    
            // Update colors based on current selection state
            layers.countries.selectAll("path")
                .attr("fill", d => 
                    globalSelectionState.countries.has(d.properties.name) ? 
                    layout.props.countrySelectColor.color : 
                    layout.props.countryColor.color
                )
                .attr("data-selected", d => 
                    globalSelectionState.countries.has(d.properties.name) ? "true" : "false"
                );
        }
    }




    return {
        initialProperties: {
            qHyperCubeDef: {
                qDimensions: [],
                qMeasures: [],
                qInitialDataFetch: [{
                    qWidth: 8,
                    qHeight: 1000
                }],
                qSuppressZero: true,
                qSuppressMissing: true
            },
            props: {
                countryColor: {
                    color: "#d4dadc",
                    index: -1
                },
                oceanColor: {
                    color: "#e6f3ff",
                    index: -1
                },
                pointColor: {
                    color: "#008936",
                    index: -1
                },
                pointBorderColor: {
                    color: "#19426C",
                    index: -1
                },
                pointBorderWidth: 1,
                pointBorderOpacity: 0.8,
                // For destination points
                destPointBorderColor: {
                    color: "#19426C",
                    index: -1
                },
                destPointBorderWidth: 1,
                destPointBorderOpacity: 0.8, 
                flowLineColor: {
                    color: "#008936",
                    index: -1
                },
                // Corrected tooltip properties
                tooltipBackgroundColor: {
                    color: "#ffffff",
                    index: -1
                },
                tooltipTextColor: {
                    color: "#19426C",
                    index: -1
                },
                tooltipBorderColor: {
                    color: "#cccccc",
                    index: -1
                },
                tooltipBorderWidth: 1,
                tooltipBorderRadius: 4,
                tooltipPadding: 8,
                tooltipFontSize: 14,
                tooltipShadowEnabled: true,
                tooltipBackgroundOpacity: 1, 
                tooltipBorderEnabled: true,
                tooltipShadowBlur: 4,
                tooltipShadowSpread: 0,
                tooltipShadowOpacity: 0.2,
                tooltipMeasureColor: {
                    color: "#2b5797",
                    index: -1
                },
                tooltipMeasureFontSize: 16,
                tooltipMeasureFontWeight: "500",
                flowLineOpacity: 0.2,
                pointSize: 3,
                baseLineWidth: 1,
                lineWidthScale: 1,
                minDestPointSize: 2,
                maxDestPointSize: 10,
                useDestinationSizing: true,
                zoomSpeed: 1.2,
                minZoom: 0.5,
                maxZoom: 2.5,
                zoomDuration: 300,
                wheelZoomEnabled: true
            },
             selectionMode: "DIRECT"
            },
            definition: {
                type: "items",
                component: "accordion",
                items: {
                    dimensions: {
                        uses: "dimensions",
                        min: 6,
                        max: 6
                    },
                    measures: {
                        uses: "measures",
                        min: 0,
                        max: 2, // Increased to allow for destination sizing measure
                        items: {
                            flowMeasure: {
                                type: "items",
                                items: {
                                    flowMeasureInfo: {
                                        component: "text",
                                        label: "First measure controls flow line width"
                                    }
                                }
                            },
                            destinationMeasure: {
                                type: "items",
                                items: {
                                    destMeasureInfo: {
                                        component: "text",
                                        label: "Second measure controls destination point size"
                                    }
                                }
                            }
                        }
                    },
                    settings: {
                        uses: "settings",
                        items: { 
                            globeSettings: {
                                label: "Globe Settings",
                                type: "items",
                                items: {
                                    countryColor: {
                                        label: "Country Color",
                                        component: "color-picker",
                                        ref: "props.countryColor",
                                        type: "object",
                                        defaultValue: {
                                            index: -1,
                                            color: "#d4dadc"
                                        }
                                    },
                                    countryHoverColor: {
                                        label: "Country Hover Color",
                                        component: "color-picker",
                                        ref: "props.countryHoverColor",
                                        type: "object",
                                        defaultValue: {
                                            index: -1,
                                            color: "#b8bfc2"
                                        }
                                    },
                                    countrySelectColor: {
                                        label: "Country Selection Color",
                                        component: "color-picker",
                                        ref: "props.countrySelectColor",
                                        type: "object",
                                        defaultValue: {
                                            index: -1,
                                            color: "#9ca6aa"
                                        }
                                    },
                                    enableCountrySelection: {
                                        ref: "props.enableCountrySelection",
                                        label: "Enable Country Selection",
                                        type: "boolean",
                                        defaultValue: true
                                    },
                                    oceanColor: {
                                        label: "Ocean Color",
                                        component: "color-picker",
                                        ref: "props.oceanColor",
                                        type: "object",
                                        defaultValue: {
                                            index: -1,
                                            color: "#e6f3ff"
                                        }
                                    }
                                }
                            },
                            pointSettings:{
                                label: "Point Settings",
                                type: "items",
                                items: {
                                    pointShowLimit: {
                                        ref: "props.pointShowLimit",
                                        label: "Point Show Limit",
                                        type: "integer",
                                        expression: "optional",
                                        defaultValue: 1000,
                                        min: 100,
                                        max: 10000
                                    },
                                    showPointLimitWarning: {
                                        ref: "props.showPointLimitWarning",
                                        label: "Show Warning When Limited",
                                        type: "boolean",
                                        defaultValue: false  // Changed to false by default
                                    },
                                    warningSettings: {
                                        label: "Warning Settings",
                                        type: "items",
                                        show: function(data) {
                                            return data.props.showPointLimitWarning === true;
                                        },
                                        items: {
                                            warningMessage: {
                                                ref: "props.warningMessage",
                                                label: "Warning Message",
                                                type: "string",
                                                expression: "optional",
                                                defaultValue: "Data limited to {limit} points. Consider applying filters for complete view.",
                                                show: function(data) {
                                                    return data.props.showPointLimitWarning === true;
                                                }
                                            },
                                            warningPosition: {
                                                ref: "props.warningPosition",
                                                label: "Position",
                                                type: "string",
                                                component: "dropdown",
                                                options: [
                                                    { value: "top", label: "Top" },
                                                    { value: "bottom", label: "Bottom" }
                                                ],
                                                defaultValue: "top",
                                                show: function(data) {
                                                    return data.props.showPointLimitWarning === true;
                                                }
                                            },
                                            warningBackgroundColor: {
                                                label: "Warning Background",
                                                component: "color-picker",
                                                ref: "props.warningBackgroundColor",
                                                type: "object",
                                                defaultValue: {
                                                    index: -1,
                                                    color: "#fff3cd"
                                                },
                                                show: function(data) {
                                                    return data.props.showPointLimitWarning === true;
                                                }
                                            },
                                            warningBackgroundOpacity: {
                                                ref: "props.warningBackgroundOpacity",
                                                label: "Warning Background Opacity",
                                                type: "number",
                                                component: "slider",
                                                min: 0,
                                                max: 1,
                                                step: 0.1,
                                                defaultValue: 0.9,
                                                show: function(data) {
                                                    return data.props.showPointLimitWarning === true;  // Fixed typo here
                                                }
                                            },
                                            warningTextColor: {
                                                label: "Warning Text",
                                                component: "color-picker",
                                                ref: "props.warningTextColor",
                                                type: "object",
                                                defaultValue: {
                                                    index: -1,
                                                    color: "#856404"
                                                },
                                                show: function(data) {
                                                    return data.props.showPointLimitWarning === true;
                                                }
                                            }
                                        }
                                    },
                                    pointColor: {
                                        label: "Point Color",
                                        component: "color-picker",
                                        ref: "props.pointColor",
                                        type: "object",
                                        defaultValue: {
                                            index: -1,
                                            color: "#000075"
                                        }
                                    },
                                    pointColorOpacity: {
                                        ref: "props.pointColorOpacity",
                                        label: "Point Color Opacity",
                                        type: "number",
                                        component: "slider",
                                        min: 0,
                                        max: 1,
                                        step: 0.1,
                                        defaultValue: 1
                                    },
                                    pointSize: {
                                        ref: "props.pointSize",
                                        label: "Origin Point Size",
                                        type: "number",
                                        component: "slider",
                                        min: 1,
                                        max: 10,
                                        step: 1,
                                        defaultValue: 3
                                    },
                                    pointBorderSettings: {
                                        label: "Point Border Settings",
                                        type: "items",
                                        items: {
                                            pointBorderColor: {
                                                label: "Origin Point Border Color",
                                                component: "color-picker",
                                                ref: "props.pointBorderColor",
                                                type: "object",
                                                defaultValue: {
                                                    index: -1,
                                                    color: "#ffffff"
                                                }
                                            },
                                            pointBorderWidth: {
                                                ref: "props.pointBorderWidth",
                                                label: "Origin Point Border Width",
                                                type: "number",
                                                component: "slider",
                                                min: 0,
                                                max: 5,
                                                step: 0.5,
                                                defaultValue: 1
                                            },
                                            pointBorderOpacity: {
                                                ref: "props.pointBorderOpacity",
                                                label: "Origin Point Border Opacity",
                                                type: "number",
                                                component: "slider",
                                                min: 0,
                                                max: 1,
                                                step: 0.1,
                                                defaultValue: 0.8
                                            },
                                            destPointBorderColor: {
                                                label: "Destination Point Border Color",
                                                component: "color-picker",
                                                ref: "props.destPointBorderColor",
                                                type: "object",
                                                defaultValue: {
                                                    index: -1,
                                                    color: "#ffffff"
                                                },
                                                show: function(data) {
                                                    return data.props.useDestinationSizing;
                                                }
                                            },
                                            destPointBorderWidth: {
                                                ref: "props.destPointBorderWidth",
                                                label: "Destination Point Border Width",
                                                type: "number",
                                                component: "slider",
                                                min: 0,
                                                max: 5,
                                                step: 0.5,
                                                defaultValue: 1,
                                                show: function(data) {
                                                    return data.props.useDestinationSizing;
                                                }
                                            },
                                            destPointBorderOpacity: {
                                                ref: "props.destPointBorderOpacity",
                                                label: "Destination Point Border Opacity",
                                                type: "number",
                                                component: "slider",
                                                min: 0,
                                                max: 1,
                                                step: 0.1,
                                                defaultValue: 0.8,
                                                show: function(data) {
                                                    return data.props.useDestinationSizing;
                                                }
                                            }
                                        }
                                    },
                                    useDestinationSizing: {
                                        ref: "props.useDestinationSizing",
                                        label: "Size Destination Points by Measure",
                                        type: "boolean",
                                        defaultValue: false
                                    },
                                    minDestPointSize: {
                                        ref: "props.minDestPointSize",
                                        label: "Min Destination Point Size",
                                        type: "number",
                                        component: "slider",
                                        min: 1,
                                        max: 8,
                                        step: 1,
                                        defaultValue: 2,
                                        show: function(data) {
                                            return data.props.useDestinationSizing;
                                        }
                                    },
                                    maxDestPointSize: {
                                        ref: "props.maxDestPointSize",
                                        label: "Max Destination Point Size",
                                        type: "number",
                                        component: "slider",
                                        min: 4,
                                        max: 20,
                                        step: 1,
                                        defaultValue: 10,
                                        show: function(data) {
                                            return data.props.useDestinationSizing;
                                        }
                                    }
                                }        
                            },
                            flowSettings: {
                                label: "Flow Settings",
                                type: "items",
                                items: {
                                    flowLineColor: {
                                        label: "Flow Line Color",
                                        component: "color-picker",
                                        ref: "props.flowLineColor",
                                        type: "object",
                                        defaultValue: {
                                            index: -1,
                                            color: "#000075"
                                        }
                                    },
                                    flowLineOpacity: {
                                        ref: "props.flowLineOpacity",
                                        label: "Flow Line Opacity",
                                        type: "number",
                                        component: "slider",
                                        min: 0,
                                        max: 1,
                                        step: 0.1,
                                        defaultValue: 0.2
                                    },
                                    baseLineWidth: {
                                        ref: "props.baseLineWidth",
                                        label: "Base Line Width",
                                        type: "number",
                                        component: "slider",
                                        min: 0.5,
                                        max: 10,
                                        step: 0.5,
                                        defaultValue: 1
                                    },
                                    lineWidthScale: {
                                        ref: "props.lineWidthScale",
                                        label: "Line Width Scale Factor",
                                        type: "number",
                                        component: "slider",
                                        min: 0.1,
                                        max: 5,
                                        step: 0.1,
                                        defaultValue: 1
                                    }
                                }
                            },
                            zoomSettings: {
                                label: "Zoom Settings",
                                type: "items",
                                items: {
                                    minZoomScale: {
                                        ref: "props.minZoomScale",
                                        label: "Minimum Zoom Scale",
                                        type: "number",
                                        component: "slider",
                                        min: 0.1,
                                        max: 1,
                                        step: 0.1,
                                        defaultValue: 0.5
                                    },
                                    maxZoomScale: {
                                        ref: "props.maxZoomScale",
                                        label: "Maximum Zoom Scale",
                                        type: "number",
                                        component: "slider",
                                        min: 1,
                                        max: 10,
                                        step: 0.5,
                                        defaultValue: 2.5
                                    },
                                    initialZoom: {
                                        ref: "props.initialZoom",
                                        label: "Initial Zoom Level",
                                        type: "number",
                                        component: "slider",
                                        min: 0.5,
                                        max: 2.5,
                                        step: 0.1,
                                        defaultValue: 1.25
                                    },
                                    zoomSpeed: {
                                        ref: "props.zoomSpeed",
                                        label: "Zoom Speed Factor",
                                        type: "number",
                                        component: "slider",
                                        min: 1.1,
                                        max: 2,
                                        step: 0.1,
                                        defaultValue: 1.2
                                    }
                                    
                                    
                                }
                            },
                            // Modify the tooltip settings section in the definition:
                            tooltipSettings: {
                                label: "Tooltip Settings",
                                type: "items",
                                items: {
                                    appearance: {
                                        type: "items",
                                        label: "Appearance",
                                        items: {
                                            tooltipBackgroundColor: {
                                                label: "Background Color",
                                                component: "color-picker",
                                                ref: "props.tooltipBackgroundColor",
                                                type: "object",
                                                defaultValue: {
                                                    index: -1,
                                                    color: "#ffffff"
                                                }
                                            },
                                            tooltipBackgroundOpacity: {
                                                ref: "props.tooltipBackgroundOpacity",
                                                label: "Background Opacity",
                                                type: "number",
                                                expression: "optional",
                                                component: "slider",
                                                min: 0,
                                                max: 1,
                                                step: 0.1,
                                                defaultValue: 1
                                            }
                                        }
                                    },
                                    baseText: {
                                        type: "items",
                                        label: "Base Text Style",
                                        items: {
                                            tooltipTextColor: {
                                                label: "Dimension Text Color",
                                                component: "color-picker",
                                                ref: "props.tooltipTextColor",
                                                type: "object",
                                                defaultValue: {
                                                    index: -1,
                                                    color: "#666666"  // Changed to match the dimmer text color we use
                                                }
                                            },
                                            tooltipFontSize: {
                                                ref: "props.tooltipFontSize",
                                                label: "Dimension Font Size",
                                                type: "number",
                                                expression: "optional",
                                                component: "slider",
                                                min: 10,
                                                max: 24,
                                                step: 1,
                                                defaultValue: 14
                                            },
                                            tooltipDimensionFontWeight: {
                                                ref: "props.tooltipDimensionFontWeight",
                                                label: "Dimension Font Weight",
                                                type: "string",
                                                component: "buttongroup",
                                                options: [
                                                    { value: "normal", label: "Normal" },
                                                    { value: "500", label: "Medium" },
                                                    { value: "bold", label: "Bold" }
                                                ],
                                                defaultValue: "500"
                                            }
                                        }
                                    },
                                    measureValue: {
                                        type: "items",
                                        label: "Measure Value Style",
                                        items: {
                                            tooltipMeasureColor: {
                                                label: "Measure Color",
                                                component: "color-picker",
                                                ref: "props.tooltipMeasureColor",
                                                type: "object",
                                                defaultValue: {
                                                    index: -1,
                                                    color: "#2b5797"
                                                }
                                            },
                                            tooltipMeasureFontSize: {
                                                ref: "props.tooltipMeasureFontSize",
                                                label: "Measure Font Size",
                                                type: "number",
                                                expression: "optional",
                                                component: "slider",
                                                min: 12,
                                                max: 28,
                                                step: 1,
                                                defaultValue: 16
                                            },
                                            tooltipMeasureFontWeight: {
                                                ref: "props.tooltipMeasureFontWeight",
                                                label: "Measure Font Weight",
                                                type: "string",
                                                component: "buttongroup",
                                                options: [
                                                    { value: "normal", label: "Normal" },
                                                    { value: "500", label: "Medium" },
                                                    { value: "bold", label: "Bold" }
                                                ],
                                                defaultValue: "500"
                                            }
                                        }
                                    },
                                    spacing: {
                                        type: "items",
                                        label: "Spacing",
                                        items: {
                                            tooltipPadding: {
                                                ref: "props.tooltipPadding",
                                                label: "Padding",
                                                type: "number",
                                                expression: "optional",
                                                component: "slider",
                                                min: 4,
                                                max: 20,
                                                step: 2,
                                                defaultValue: 8
                                            }
                                        }
                                    },
                                    border: {
                                        type: "items",
                                        label: "Border",
                                        items: {
                                            tooltipBorderEnabled: {
                                                ref: "props.tooltipBorderEnabled",
                                                label: "Show Border",
                                                type: "boolean",
                                                defaultValue: true
                                            },
                                            tooltipBorderColor: {
                                                label: "Border Color",
                                                component: "color-picker",
                                                ref: "props.tooltipBorderColor",
                                                type: "object",
                                                defaultValue: {
                                                    index: -1,
                                                    color: "#cccccc"
                                                },
                                                show: function(data) {
                                                    return data.props.tooltipBorderEnabled;
                                                }
                                            },
                                            tooltipBorderWidth: {
                                                ref: "props.tooltipBorderWidth",
                                                label: "Border Width",
                                                type: "number",
                                                expression: "optional",
                                                component: "slider",
                                                min: 0,
                                                max: 5,
                                                step: 1,
                                                defaultValue: 1,
                                                show: function(data) {
                                                    return data.props.tooltipBorderEnabled;
                                                }
                                            },
                                            tooltipBorderRadius: {
                                                ref: "props.tooltipBorderRadius",
                                                label: "Border Radius",
                                                type: "number",
                                                component: "slider",
                                                min: 0,
                                                max: 20,
                                                step: 1,
                                                defaultValue: 4,
                                                expression: "optional"
                                            }
                                        }
                                    },
                                    shadow: {
                                        type: "items",
                                        label: "Shadow",
                                        items: {
                                            tooltipShadowEnabled: {
                                                ref: "props.tooltipShadowEnabled",
                                                label: "Enable Shadow",
                                                type: "boolean",
                                                defaultValue: true
                                            },
                                            tooltipShadowBlur: {
                                                ref: "props.tooltipShadowBlur",
                                                label: "Blur",
                                                type: "number",
                                                expression: "optional",
                                                component: "slider",
                                                min: 0,
                                                max: 20,
                                                step: 1,
                                                defaultValue: 4,
                                                show: function(data) {
                                                    return data.props.tooltipShadowEnabled;
                                                }
                                            },
                                            tooltipShadowSpread: {
                                                ref: "props.tooltipShadowSpread",
                                                label: "Spread",
                                                type: "number",
                                                expression: "optional",
                                                component: "slider",
                                                min: 0,
                                                max: 20,
                                                step: 1,
                                                defaultValue: 0,
                                                show: function(data) {
                                                    return data.props.tooltipShadowEnabled;
                                                }
                                            },
                                            tooltipShadowOpacity: {
                                                ref: "props.tooltipShadowOpacity",
                                                label: "Opacity",
                                                type: "number",
                                                expression: "optional",
                                                component: "slider",
                                                min: 0,
                                                max: 1,
                                                step: 0.1,
                                                defaultValue: 0.2,
                                                show: function(data) {
                                                    return data.props.tooltipShadowEnabled;
                                                }
                                            }
                                        }
                                    }
                                }
                            }   
                        }
                    }
                }
            },
            
            paint: function($element, layout) {

                // Create a unique key for this extension instance
                const instanceKey = 'globe-animated-' + layout.qInfo.qId;
                
                // Check if this instance has already been animated
                const hasAnimated = ANIMATION_STATE.hasAnimated.has(instanceKey);

                console.log('Paint called with layout:', {
                    countryColor: layout.props.countryColor,
                    countrySelectColor: layout.props.countrySelectColor,
                    countryHoverColor: layout.props.countryHoverColor
                });

                // // Store current selection state before repaint
                // const currentSelectedOrigin = selectedOrigin;
                // const currentSelectedDestinations = new Set(selectedDestinations);
                const previousState = {...globalSelectionState};


                const app = qlik.currApp(this);
                const self = this;
            
                // Clear existing content properly
                const containerId = 'globe-container-' + layout.qInfo.qId;
                const existingContainer = document.getElementById(containerId);
                if (existingContainer) {
                    existingContainer.remove();
                }
                $element.empty();
            
                // Clear any existing tooltips
                const existingTooltip = d3.select("#globe-tooltip");
                if (!existingTooltip.empty()) {
                    existingTooltip.remove();
                }
            
                // Create new container with explicit height
                // Create new container with animation styles
                const container = document.createElement('div');
                container.id = containerId;
                container.className = 'qv-extension-qlik-globe';
                container.style.cssText = `
                    width: 100%;
                    height: 100%;
                    min-height: 400px;
                    position: relative;
                    background-color: #f5f5f5;
                    opacity: ${hasAnimated ? '1' : '0'};
                    transform: ${hasAnimated ? 'none' : 'translateX(-20%) scale(0.3)'};
                    transition: opacity 1s ease-out, transform 2s ease-out;
                `;
                $element.append(container);

                // Add CSS to parent element to ensure proper height inheritance
                $element.css({
                    height: '100%',
                    position: 'relative',
                    overflow: 'hidden'
                });

                    // Add container size logging
                // console.log('Container dimensions:', {
                //     width: $element.width(),
                //     height: $element.height()
                // });
                        
                // Start data loading
                getAllData(this, $element, layout).then(allData => {
                    if (allData.length === layout.props.pointShowLimit && layout.props.showPointLimitWarning === true) {
                        // Helper function to convert hex to rgba
                        function hexToRgba(hex, alpha) {
                            let r = 0, g = 0, b = 0;
                            
                            // Remove the hash if present
                            hex = hex.replace('#', '');
                            
                            // Handle both 3-char and 6-char hex codes
                            if (hex.length === 3) {
                                r = parseInt(hex[0] + hex[0], 16);
                                g = parseInt(hex[1] + hex[1], 16);
                                b = parseInt(hex[2] + hex[2], 16);
                            } else if (hex.length === 6) {
                                r = parseInt(hex.substring(0, 2), 16);
                                g = parseInt(hex.substring(2, 4), 16);
                                b = parseInt(hex.substring(4, 6), 16);
                            }
                            
                            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
                        }
                    
                        const backgroundColor = layout.props.warningBackgroundColor?.color || "#fff3cd";
                        const opacity = layout.props.warningBackgroundOpacity ?? 0.9;
                        const backgroundColorWithOpacity = backgroundColor.startsWith('#') ? 
                            hexToRgba(backgroundColor, opacity) : 
                            backgroundColor;
                    
                        const warningDiv = d3.select(`#${containerId}`)
                            .append("div")
                            .attr("class", "point-limit-warning")
                            .style("position", "absolute")
                            .style(layout.props.warningPosition === 'bottom' ? "bottom" : "top", "10px")
                            .style("right", "10px")
                            .style("background-color", backgroundColorWithOpacity)
                            .style("padding", "8px 12px")
                            .style("border-radius", "4px")
                            .style("border", "1px solid rgba(0,0,0,0.1)")
                            .style("font-size", "12px")
                            .style("color", layout.props.warningTextColor?.color || "#856404")
                            .style("z-index", "1000")
                            .style("max-width", "300px")
                            .style("box-shadow", "0 2px 4px rgba(0,0,0,0.1)")
                            .text(layout.props.warningMessage?.replace("{limit}", layout.props.pointShowLimit) || 
                                `Data limited to ${layout.props.pointShowLimit} points. Consider applying filters for complete view.`);
                    }

                    
                    //console.log('Data loaded:', allData.length, 'rows');
                    try {
                        // Process the data
                        const flows = allData.map(row => ({
                            origin: {
                                latitude: row[0].qNum,
                                longitude: row[1].qNum,
                                name: row[2].qText,
                                elemNumber: row[2].qElemNumber
                            },
                            destination: {
                                latitude: row[3].qNum,
                                longitude: row[4].qNum,
                                name: row[5].qText,
                                elemNumber: row[5].qElemNumber
                            },
                            value: row[6] ? row[6].qNum : 1,
                            destValue: row[7] ? row[7].qNum : null,
                            originElemNumber: row[2].qElemNumber,
                            destElemNumber: row[5].qElemNumber
                        }));
                        //console.log('Processed flows:', flows.length);
                        // Initialize visualization
                        const $container = $(`#${containerId}`);
                        const width = $container.width();
                        let height = $container.height();

                        // If height is 0, use a reasonable default based on width
                        if (height === 0) {
                            height = Math.min(width * 0.75, 600); // 4:3 aspect ratio with max height of 600px
                            $container.height(height);
                        }

                        //console.log('Adjusted dimensions:', { width, height });

                        const radius = Math.min(width, height) / 2.5;

                        //console.log('Visualization dimensions:', { width, height, radius });

                        // Define zoom scales
                        const minScale = radius * (layout.props.minZoomScale || 0.5);
                        const maxScale = radius * (layout.props.maxZoomScale || 2.5);
                        const defaultScale = radius * (layout.props.initialZoom || 1);
    
                        const svg = d3.select(`#${containerId}`)
                            .append("svg")
                            .attr("width", width)
                            .attr("height", height);
    
                            const projection = d3.geoOrthographic()
                            .scale(defaultScale)
                            .center([0, 0])
                            .rotate(hasAnimated ? [0, -25, 0] : [90, -25, 0])  // Start from left side if first time
                            .translate([width / 2, height / 2]);
                        
                        // Add initial rotation animation if this is the first load
                        if (!hasAnimated) {
                            // Mark as animated
                            ANIMATION_STATE.hasAnimated.add(instanceKey);
                            
                            // Trigger container animation
                            setTimeout(() => {
                                container.style.opacity = '1';
                                container.style.transform = 'none';
                            }, 100);
                        
                            // Add globe rotation animation
                            d3.transition()
                                .duration(2000)
                                .ease(d3.easeCubicInOut)
                                .tween("rotate", () => {
                                    const r = d3.interpolate([90, -25, 0], [0, -25, 0]);
                                    return t => {
                                        projection.rotate(r(t));
                                        layers.countries.selectAll("path").attr("d", path);
                                        updateFlows();
                                    };
                                });
                        }

                                              

                        const path = d3.geoPath().projection(projection);

                        const layers = {
                            ocean: svg.append("g").attr("class", "ocean-layer"),
                            countries: svg.append("g").attr("class", "country-layer"),
                            flows: svg.append("g").attr("class", "flow-layer"),
                            points: svg.append("g").attr("class", "point-layer")
                        };

                        

                        

                        const points = processPoints(flows);

                        // If destination sizing is enabled, calculate the scale
                        if (layout.props.useDestinationSizing) {
                            const destPoints = points.filter(p => !p.isOrigin);
                            if (destPoints.length > 0) {
                                const minValue = Math.min(...destPoints.map(p => p.totalValue));
                                const maxValue = Math.max(...destPoints.map(p => p.totalValue));
                                                                                
                            }
                        }                        

                        // // Check for existing tooltip and remove it
                        // const existingTooltip = d3.select("#globe-tooltip");
                        // if (existingTooltip.size()) {
                        //     existingTooltip.remove();
                        // }

                        // Create new tooltip with proper styles
                        const tooltip = createTooltip();

                        // Draw ocean
                        layers.ocean.append("circle")
                        .attr("cx", width/2)
                        .attr("cy", height/2)
                        .attr("r", defaultScale)
                        .attr("class", "ocean")
                        .attr("fill", layout.props.oceanColor.color);
                        // Draw Countries 
                        
                        // Try to restore selection state
                        const container = document.getElementById('globe-container-' + layout.qInfo.qId);
                        if (container) {
                            const savedState = container.getAttribute('data-selection-state');
                            if (savedState) {
                                try {
                                    const state = JSON.parse(savedState);
                                    selectedCountries = new Set(state.countries);
                                    
                                    // Restore colors immediately
                                    layers.countries.selectAll("path")
                                        .data(worldData.features)
                                        .enter()
                                        .append("path")
                                        .attr("d", path)
                                        .attr("class", "country")
                                        .attr("fill", d => 
                                            selectedCountries.has(d.properties.name) ? 
                                            layout.props.countrySelectColor.color : 
                                            layout.props.countryColor.color
                                        )
                                        .attr("stroke", "#999")
                                        .attr("stroke-width", 0.5)
                                        .attr("data-selected", d => 
                                            selectedCountries.has(d.properties.name) ? "true" : "false"
                                        );

                                    // If there was a last point, update with it
                                    if (state.lastPoint) {
                                        updateCountryColors(state.lastPoint, layers, layout, worldData);
                                    }
                                } catch (e) {
                                    console.error('Error restoring selection state:', e);
                                }
                            } else {
                                // No saved state, draw countries normally
                                layers.countries.selectAll("path")
                                    .data(worldData.features)
                                    .enter()
                                    .append("path")
                                    .attr("d", path)
                                    .attr("class", "country")
                                    .attr("fill", layout.props.countryColor.color)
                                    .attr("stroke", "#999")
                                    .attr("stroke-width", 0.5);
                            }
                        }

                        // Add click handler to clear selections
                        svg.on("click", (event) => {
                            if (event.target.tagName === 'svg') { // Only if clicking the SVG background
                                selectedCountries.clear();
                                layers.countries.selectAll("path")
                                    .attr("fill", layout.props.countryColor.color)
                                    .attr("data-selected", "false");
                                
                                // Clear stored state
                                if (container) {
                                    container.removeAttribute('data-selection-state');
                                }
                            }
                        });

                        if (isValidProjection()) {
                            layers.countries.selectAll("path")
                                .data(worldData.features)
                                .enter()
                                .append("path")
                                .attr("d", path)
                                .attr("class", "country")
                                .attr("fill", layout.props.countryColor.color)
                                .attr("stroke", "#999")
                                .attr("stroke-width", 0.5)
                                .style("cursor", layout.props.enableCountrySelection ? "pointer" : "default")
                                .attr("data-selected", "false") // Add data attribute to track selection state
                                .on("mouseover", function(event, d) {
                                    const isSelected = d3.select(this).attr("data-selected") === "true";
                                    if (!isSelected) {
                                        d3.select(this)
                                            .attr("fill", layout.props.countryHoverColor.color);
                                    }
                                        
                                    const tooltipContent = `
                                        <div style="
                                            font-size: ${layout.props.tooltipFontSize || 14}px;
                                            font-weight: ${layout.props.tooltipDimensionFontWeight || "500"};
                                            color: ${getColor(layout.props.tooltipTextColor, "#666666")};
                                        ">${d.properties.name}</div>
                                    `;
                                    
                                    showTooltip(event, d, tooltipContent);
                                })
                                .on("mouseout", function(event, d) {
                                    const isSelected = d3.select(this).attr("data-selected") === "true";
                                    d3.select(this)
                                        .attr("fill", isSelected ? 
                                            layout.props.countrySelectColor.color : 
                                            layout.props.countryColor.color);
                                    hideTooltip();
                                })
                                // In the point click handler, before making a new selection:
                                // In the point click handler:
                                .on("click", function(event, d) {
                                    console.log('Point click start:', {
                                        isOrigin: d.isOrigin,
                                        name: d.name,
                                        elemNumber: d.elemNumber
                                    });
                                    
                                    event.stopPropagation();
                                    if (!layout.qHyperCube.qDimensionInfo[2].qLocked) {
                                        // Clear existing selections first
                                        globalSelectionState.countries.clear();
                                        layers.countries.selectAll("path")
                                            .attr("fill", layout.props.countryColor.color)
                                            .attr("data-selected", "false");

                                        if (!selectedOrigin) {
                                            selectedOrigin = {
                                                ...d,
                                                elemNumber: d.elemNumber,
                                                deselect: false
                                            };
                                            globalSelectionState.selectedOrigin = selectedOrigin;
                                            selectedDestinations.clear();
                                            globalSelectionState.selectedDestinations.clear();
                                            
                                            const pointWithDeselect = {
                                                ...d,
                                                deselect: false
                                            };
                                            
                                            requestAnimationFrame(() => {
                                                updateCountryColors(pointWithDeselect, layers, layout, worldData);
                                                updateVisualState();
                                            });
                                        } else {
                                            const isDeselecting = selectedDestinations.has(d.elemNumber);
                                            const pointWithDeselect = {
                                                ...d,
                                                deselect: isDeselecting
                                            };

                                            if (isDeselecting) {
                                                selectedDestinations.delete(d.elemNumber);
                                                globalSelectionState.selectedDestinations.delete(d.elemNumber);
                                            } else {
                                                selectedDestinations.add(d.elemNumber);
                                                globalSelectionState.selectedDestinations.add(d.elemNumber);
                                            }
                                            
                                            requestAnimationFrame(() => {
                                                updateCountryColors(pointWithDeselect, layers, layout, worldData);
                                                updateVisualState();
                                            });
                                        }
                                        
                                        // Handle Qlik selection
                                        const fieldName = layout.qHyperCube.qDimensionInfo[2].qGroupFieldDefs[0];
                                        qlik.currApp(this).field(fieldName).selectMatch(d.name, false)
                                            .then(() => {
                                                console.log('Selection completed');
                                            });
                                    }
                                });
                        }
                
                        // Setup interactions
                        setupInteractions(svg, projection, layers, path, minScale, maxScale, layout);
                        
                        // Ensure the tooltip background color is properly set
                        if (layout.props.tooltipBackgroundColor) {
                            const backgroundColor = getBackgroundColor(
                                layout.props.tooltipBackgroundColor, 
                                layout.props, 
                                "rgba(255, 255, 255, 1)"
                            );
                            tooltip.style("background-color", backgroundColor);
                        }

                        // Add these helper functions at the top level, just after the worldData declaration:
                        function hexToRgba(hex, alpha) {
                            // Remove # if present
                            hex = hex.replace('#', '');
                            
                            // Handle shorthand hex (#fff)
                            if (hex.length === 3) {
                                hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
                            }
                            
                            const r = parseInt(hex.substring(0, 2), 16);
                            const g = parseInt(hex.substring(2, 4), 16);
                            const b = parseInt(hex.substring(4, 6), 16);
                            
                            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
                        }

                        function getBackgroundColor(colorObj, props, defaultColor) {
                            if (colorObj && typeof colorObj === 'object' && colorObj.color) {
                                const color = colorObj.color.toLowerCase();
                                const opacity = props.tooltipBackgroundOpacity ?? 1;

                                // Handle hex colors
                                if (color.startsWith('#')) {
                                    return hexToRgba(color, opacity);
                                }
                                
                                // Handle rgb/rgba colors
                                if (color.startsWith('rgb')) {
                                    if (color.startsWith('rgba')) {
                                        // Extract existing rgb values and apply new opacity
                                        const rgbaValues = color.match(/[\d.]+/g);
                                        return `rgba(${rgbaValues[0]}, ${rgbaValues[1]}, ${rgbaValues[2]}, ${opacity})`;
                                    }
                                    // Convert rgb to rgba
                                    const rgbValues = color.match(/\d+/g);
                                    return `rgba(${rgbValues[0]}, ${rgbValues[1]}, ${rgbValues[2]}, ${opacity})`;
                                }
                                
                                // Handle named colors
                                const tempElement = document.createElement('div');
                                tempElement.style.color = color;
                                document.body.appendChild(tempElement);
                                const computedColor = window.getComputedStyle(tempElement).color;
                                document.body.removeChild(tempElement);
                                
                                // Convert computed rgb to rgba
                                const rgbValues = computedColor.match(/\d+/g);
                                return `rgba(${rgbValues[0]}, ${rgbValues[1]}, ${rgbValues[2]}, ${opacity})`;
                            }
                            
                            return defaultColor;
                        }

                        function getColor(colorObj, defaultColor) {
                            return colorObj && typeof colorObj === 'object' && colorObj.color ? 
                                colorObj.color : defaultColor;
                        }

                        function createTooltip() {
                            const tooltip = d3.select("body")
                                .append("div")
                                .attr("id", "globe-tooltip")
                                .style("display", "none")
                                .style("position", "fixed")
                                .style("z-index", "999999")
                                .style("pointer-events", "none");
                            
                            // Apply styles immediately after creation
                            applyTooltipStyles(tooltip, layout.props);
                            
                            return tooltip;
                        }

                        // Update the applyTooltipStyles function with better color handling:
                        // Then update the applyTooltipStyles function:
                        function applyTooltipStyles(tooltip, props) {
                            if (!tooltip || !props) return;
                        
                            const styles = {
                                "background-color": getBackgroundColor(props.tooltipBackgroundColor, props, "rgba(255, 255, 255, 1)"),
                                "color": getColor(props.tooltipTextColor, "#333333"),
                                "border": props.tooltipBorderEnabled ? 
                                    `${props.tooltipBorderWidth || 1}px solid ${getColor(props.tooltipBorderColor, "#cccccc")}` : 
                                    "none",
                                // Use explicit check for zero value
                                "border-radius": `${props.tooltipBorderRadius !== undefined ? props.tooltipBorderRadius : 4}px`,
                                "padding": `${props.tooltipPadding || 8}px`,
                                "font-size": `${props.tooltipFontSize || 14}px`,
                                "box-shadow": props.tooltipShadowEnabled ? 
                                    `0 2px ${props.tooltipShadowBlur || 4}px ${props.tooltipShadowSpread || 0}px rgba(0,0,0,${props.tooltipShadowOpacity || 0.2})` : 
                                    "none"
                            };
                        
                            Object.entries(styles).forEach(([key, value]) => {
                                tooltip.style(key, value);
                            });
                        }
                        // Apply styles initially
                        applyTooltipStyles();

                        // Update the tooltip event handlers to use a more efficient approach:
                        function showTooltip(event, data, tooltipContent) {
                            const tooltip = d3.select("#globe-tooltip");
                            
                            // Only update if tooltip exists
                            if (!tooltip.empty()) {
                                tooltip
                                    .style("display", "block")
                                    .style("left", (event.pageX + 10) + "px")
                                    .style("top", (event.pageY - 10) + "px")
                                    .html(tooltipContent);
                            }
                        }

                        function hideTooltip() {
                            const tooltip = d3.select("#globe-tooltip");
                            if (!tooltip.empty()) {
                                tooltip.style("display", "none");
                            }
                        }

                        function animateToPoint(startState, targetRotation) {
                            d3.transition()
                                .duration(1000)
                                .ease(d3.easeCubicInOut)
                                .tween("rotate", () => {
                                    const rotationInterpolator = d3.interpolate(projection.rotate(), targetRotation);
                                    
                                    return t => {
                                        const currentRotation = rotationInterpolator(t);
                                        projection.rotate(currentRotation);
                                        
                                        // Tüm görsel elemanları güncelle
                                        layers.ocean.select("circle").attr("r", projection.scale());
                                        layers.countries.selectAll("path").attr("d", path);
                                        updateFlows();
                                        updateZoomIndicator(projection.scale());
                                        updateVisualState();
                                    };
                                });
                        }

                       

                        
                        
                        
                        function isValidProjection() {
                            const test = projection([0, 0]);
                            return test && !test.some(isNaN);
                        }

                        
                        
            
                        
                        function updateVisualState() {
                            if (!layers) return;
                        
                            // Update flow lines opacity and styling
                            layers.flows.selectAll("path")
                                .style("opacity", d => {
                                    // If there's no selected origin, use default opacity
                                    if (!selectedOrigin) {
                                        return layout.props.flowLineOpacity;
                                    }
                        
                                    // If this flow is from the selected origin
                                    if (d.originElemNumber === selectedOrigin.elemNumber) {
                                        // If this flow's destination is selected
                                        if (selectedDestinations.has(d.destElemNumber)) {
                                            return layout.props.flowLineOpacity; // Full opacity for selected flows
                                        }
                                        return layout.props.flowLineOpacity * 0.8; // Slightly reduced for other flows from selected origin
                                    }
                        
                                    // All other flows should be more visible but still distinguished
                                    return layout.props.flowLineOpacity * 0.5;
                                })
                                .style("stroke-width", d => {
                                    const baseWidth = layout.props.baseLineWidth * Math.sqrt(d.value || 1) * layout.props.lineWidthScale;
                                    
                                    // Keep the width consistent regardless of selection state
                                    return baseWidth;
                                })
                                .style("stroke", d => {
                                    // Highlight selected flows
                                    if (selectedOrigin && 
                                        d.originElemNumber === selectedOrigin.elemNumber && 
                                        selectedDestinations.has(d.destElemNumber)) {
                                        return "#ff9900"; // Highlight color for selected flows
                                    }
                                    return getColor(layout.props.flowLineColor, "#000075");
                                });
                        }
                    

                        

                        // Add CSS styles for countries
                        const styleElement = document.createElement('style');
                        styleElement.textContent = `
                            .country {
                                transition: fill 0.2s ease;
                            }
                            .country:hover {
                                cursor: pointer;
                            }
                        `;
                        document.head.appendChild(styleElement);
    
                        function updatePoints(layers, points, layout, projection) {
                            layers.points.selectAll("circle").remove();
                        
                            // Initialize sizeScale if needed
                            let sizeScale;
                            if (layout.props.useDestinationSizing) {
                                const destPoints = points.filter(p => !p.isOrigin);
                                if (destPoints.length > 0) {
                                    const minValue = Math.min(...destPoints.map(p => p.totalValue));
                                    const maxValue = Math.max(...destPoints.map(p => p.totalValue));
                                    
                                    sizeScale = d3.scaleLinear()
                                        .domain([minValue, maxValue])
                                        .range([layout.props.minDestPointSize, layout.props.maxDestPointSize]);
                                }
                            }
                        
                            const pointElements = layers.points.selectAll("circle")
                                .data(points)
                                .enter()
                                .append("circle")
                                .attr("class", d => `location ${d.isOrigin ? 'origin' : 'destination'}`)
                                .attr("r", d => {
                                    if (!d.isOrigin && layout.props.useDestinationSizing && sizeScale && d.totalValue != null) {
                                        return sizeScale(d.totalValue);
                                    }
                                    return layout.props.pointSize;
                                })
                                .attr("fill", layout.props.pointColor.color)
                                .attr("fill-opacity", layout.props.pointColorOpacity)
                                .attr("stroke", d => d.isOrigin ? 
                                    getColor(layout.props.pointBorderColor, "#ffffff") : 
                                    getColor(layout.props.destPointBorderColor, "#ffffff"))
                                .attr("stroke-width", d => d.isOrigin ? 
                                    layout.props.pointBorderWidth : 
                                    layout.props.destPointBorderWidth)
                                .attr("stroke-opacity", d => d.isOrigin ? 
                                    layout.props.pointBorderOpacity : 
                                    layout.props.destPointBorderOpacity)
                                .attr("transform", d => {
                                    const pos = projection([d.longitude, d.latitude]);
                                    return pos ? `translate(${pos[0]},${pos[1]})` : null;
                                })
                                .attr("visibility", d => {
                                    return isVisible(d.latitude, d.longitude, projection) ? "visible" : "hidden";
                                });
                        
                            // Add hover effects with proper state management and borders
                            pointElements
                                .on("mouseenter", function(event, d) {
                                    const baseSize = d.isOrigin ? layout.props.pointSize : 
                                        (layout.props.useDestinationSizing && sizeScale && d.totalValue != null) ? 
                                        sizeScale(d.totalValue) : layout.props.pointSize;
                        
                                    d3.select(this)
                                        .transition()
                                        .duration(200)
                                        .attr("r", baseSize * 1.5)
                                        .attr("stroke-width", (d.isOrigin ? 
                                            layout.props.pointBorderWidth : 
                                            layout.props.destPointBorderWidth) * 1.5);
                        
                                    const destMeasureName = layout.qHyperCube.qMeasureInfo[1] ? 
                                        layout.qHyperCube.qMeasureInfo[1].qFallbackTitle : 'Value';
                                
                                    const tooltipContent = `
                                        <div>
                                            <div style="
                                                font-size: ${layout.props.tooltipFontSize || 14}px;
                                                font-weight: ${layout.props.tooltipDimensionFontWeight || "500"};
                                                color: ${getColor(layout.props.tooltipTextColor, "#666666")};
                                            ">${d.name}</div>
                                            ${!d.isOrigin && d.totalValue != null ? `
                                                <div style="
                                                    margin-top: 4px;
                                                    color: ${getColor(layout.props.tooltipMeasureColor, "#2b5797")};
                                                    font-size: ${layout.props.tooltipMeasureFontSize || 16}px;
                                                    font-weight: ${layout.props.tooltipMeasureFontWeight || "500"};
                                                ">
                                                    ${destMeasureName}: ${d.totalValue.toLocaleString()}
                                                </div>
                                            ` : ''}
                                        </div>
                                    `;
                        
                                    showTooltip(event, d, tooltipContent);
                                })
                                .on("mouseleave", function(event, d) {
                                    const baseSize = d.isOrigin ? layout.props.pointSize : 
                                        (layout.props.useDestinationSizing && sizeScale && d.totalValue != null) ? 
                                        sizeScale(d.totalValue) : layout.props.pointSize;
                        
                                    d3.select(this)
                                        .transition()
                                        .duration(200)
                                        .attr("r", baseSize)
                                        .attr("stroke-width", d.isOrigin ? 
                                            layout.props.pointBorderWidth : 
                                            layout.props.destPointBorderWidth);
                                    
                                    hideTooltip();
                                })
                                // Modify the point click handler
                                .on("click", function(event, d) {
                                    console.log('Point click start:', {
                                        isOrigin: d.isOrigin,
                                        name: d.name,
                                        elemNumber: d.elemNumber
                                    });
                                    
                                    event.stopPropagation();
                                    if (!layout.qHyperCube.qDimensionInfo[2].qLocked) {
                                        // Clear existing selections first
                                        globalSelectionState.countries.clear();
                                        
                                        layers.countries.selectAll("path")
                                            .attr("fill", layout.props.countryColor.color)
                                            .attr("data-selected", "false");

                                        if (!selectedOrigin) {
                                            selectedOrigin = {
                                                ...d,
                                                elemNumber: d.elemNumber,
                                                deselect: false
                                            };
                                            globalSelectionState.selectedOrigin = selectedOrigin;
                                            selectedDestinations.clear();
                                            globalSelectionState.selectedDestinations.clear();
                                            
                                            const pointWithDeselect = {
                                                ...d,
                                                deselect: false
                                            };
                                            
                                            requestAnimationFrame(() => {
                                                updateCountryColors(pointWithDeselect, layers, layout, worldData);
                                                updateVisualState();
                                            });
                                        } else {
                                            const isDeselecting = selectedDestinations.has(d.elemNumber);
                                            const pointWithDeselect = {
                                                ...d,
                                                deselect: isDeselecting
                                            };

                                            if (isDeselecting) {
                                                selectedDestinations.delete(d.elemNumber);
                                                globalSelectionState.selectedDestinations.delete(d.elemNumber);
                                            } else {
                                                selectedDestinations.add(d.elemNumber);
                                                globalSelectionState.selectedDestinations.add(d.elemNumber);
                                            }
                                            
                                            requestAnimationFrame(() => {
                                                updateCountryColors(pointWithDeselect, layers, layout, worldData);
                                                updateVisualState();
                                            });
                                        }
                                        
                                        // Handle Qlik selection
                                        const fieldName = layout.qHyperCube.qDimensionInfo[2].qGroupFieldDefs[0];
                                        qlik.currApp(this).field(fieldName).selectMatch(d.name, false)
                                            .then(() => {
                                                console.log('Selection completed');
                                            });
                                        
                                            
                                    }
                                });
                               
                        
                            // Update selection visual state
                            updateVisualState();
                        
                            return function updateVisibility() {
                                layers.points.selectAll("circle")
                                    .attr("visibility", d => {
                                        return isVisible(d.latitude, d.longitude, projection) ? "visible" : "hidden";
                                    });
                            };
                        }
    
                        function updateFlows() {
                            layers.flows.selectAll("*").remove();
                            
                            flows.forEach(flow => {
                                
                                const sourceVisible = isVisible(flow.origin.latitude, flow.origin.longitude, projection);
                                const targetVisible = isVisible(flow.destination.latitude, flow.destination.longitude, projection);
                                
                                if (sourceVisible || targetVisible) {
                                const pathString = createFlowLine(flow.origin, flow.destination, projection);
                                    if (pathString) {
                                    
                                        const baseWidth = layout.props.baseLineWidth * Math.sqrt(flow.value || 1) * layout.props.lineWidthScale;
                        
                                        layers.flows.append("path") 
                                        .datum(flow)
                                        .attr("d", pathString)
                                        .attr("class", "flow-line")
                                        .attr("stroke", layout.props.flowLineColor.color)
                                        .attr("stroke-width", baseWidth)
                                        .attr("fill", "none")
                                        .attr("opacity", () => {
                                            if (!selectedOrigin) {
                                                return layout.props.flowLineOpacity;
                                            }
                                            if (flow.originElemNumber === selectedOrigin.elemNumber) {
                                                return selectedDestinations.has(flow.destElemNumber) ? 
                                                    layout.props.flowLineOpacity : 
                                                    layout.props.flowLineOpacity * 0.8;
                                            }
                                            return layout.props.flowLineOpacity * 0.5;
                                        })
                                        .on("mouseenter", function(event, flow) {
                                            d3.select(this)
                                                .raise()
                                                .transition()
                                                .duration(200)
                                                .attr("opacity", 1)
                                                .attr("stroke-width", layout.props.baseLineWidth * Math.sqrt(flow.value || 1) * layout.props.lineWidthScale * 2);
                                        
                                            const flowMeasureName = layout.qHyperCube.qMeasureInfo[0] ? 
                                                layout.qHyperCube.qMeasureInfo[0].qFallbackTitle : 'Value';
                                        
                                            const tooltipContent = `
                                                <div>
                                                    <div style="font-size: 0.9em; color: #666666;">
                                                        ${flow.origin.name} → ${flow.destination.name}
                                                    </div>
                                                    <div style="
                                                        margin-top: 4px;
                                                        color: ${getColor(layout.props.tooltipMeasureColor, "#2b5797")};
                                                        font-size: ${layout.props.tooltipMeasureFontSize || 16}px;
                                                        font-weight: ${layout.props.tooltipMeasureFontWeight || "500"};
                                                    ">
                                                        ${flowMeasureName}: ${(flow.value || 1).toLocaleString()}
                                                    </div>
                                                </div>
                                            `;
                                        
                                            showTooltip(event, flow, tooltipContent);
                                        })
                                        .on("mousemove", function(event) {
                                            const tooltip = d3.select("#globe-tooltip");
                                            if (!tooltip.empty()) {
                                                tooltip
                                                    .style("left", (event.pageX + 10) + "px")
                                                    .style("top", (event.pageY - 10) + "px");
                                            }
                                        })
                                        .on("mouseleave", function(event, flow) {
                                            // Reset the flow line styles
                                            d3.select(this)
                                                .transition()
                                                .duration(200)
                                                .attr("opacity", () => {
                                                    // Check if this flow is part of the current selection
                                                    if (selectedOrigin) {
                                                        if (flow.originElemNumber === selectedOrigin.elemNumber && 
                                                            selectedDestinations.has(flow.destElemNumber)) {
                                                            return layout.props.flowLineOpacity;
                                                        }
                                                        return layout.props.flowLineOpacity * 0.3;
                                                    }
                                                    // If no selection, return to default opacity
                                                    if (!sourceVisible || !targetVisible) {
                                                        return layout.props.flowLineOpacity * 0.9;
                                                    }
                                                    return layout.props.flowLineOpacity;
                                                })
                                                .attr("stroke-width", layout.props.baseLineWidth * Math.sqrt(flow.value || 1) * layout.props.lineWidthScale);
                                    
                                            hideTooltip();
                                        })
                                        .on("click", function(event, d) {
                                            event.stopPropagation();
                                            
                                            if (!layout.qHyperCube.qDimensionInfo[2].qLocked) {
                                                // If no origin is selected, select the origin point
                                                if (!selectedOrigin) {
                                                    selectedOrigin = {
                                                        ...d.origin,
                                                        elemNumber: d.originElemNumber
                                                    };
                                                    selectedDestinations.clear();
                                                    self.backendApi.selectValues(2, [d.originElemNumber], false);
                                                } 
                                                // If the origin is already selected, handle destination selection
                                                else if (selectedOrigin.elemNumber === d.originElemNumber) {
                                                    if (selectedDestinations.has(d.destElemNumber)) {
                                                        selectedDestinations.delete(d.destElemNumber);
                                                    } else {
                                                        selectedDestinations.add(d.destElemNumber);
                                                    }
                                                    self.backendApi.selectValues(5, Array.from(selectedDestinations), false);
                                                }
                                                // If a different origin is clicked, switch to the new origin
                                                else {
                                                    selectedOrigin = {
                                                        ...d.origin,
                                                        elemNumber: d.originElemNumber
                                                    };
                                                    selectedDestinations.clear();
                                                    selectedDestinations.add(d.destElemNumber);
                                                    self.backendApi.selectValues(2, [d.originElemNumber], false)
                                                        .then(() => {
                                                            self.backendApi.selectValues(5, [d.destElemNumber], false);
                                                        });
                                                }
                                                
                                                // Animate to show the selected flow
                                                const centroid = [
                                                    (d.origin.longitude + d.destination.longitude) / 2,
                                                    (d.origin.latitude + d.destination.latitude) / 2
                                                ];
                                                
                                                const currentState = {
                                                    scale: projection.scale(),
                                                    rotation: projection.rotate()
                                                };
                                                
                                                animateGlobe([-centroid[0], -centroid[1]], currentState.scale);
                                                updateVisualState();
                                            }
                                        });
                                    }
                                }
                            }); 
                            updatePoints(layers, points, layout, projection);
                        }
                        
                        // Add zoom controls container
                        // Update the zoom controls to be touch-friendly
                        const zoomControls = d3.select(`#${containerId}`)
                            .append("div")
                            .attr("class", "zoom-controls")
                            .style("position", "absolute")
                            .style("bottom", "20px")
                            .style("left", "20px")
                            .style("display", "flex")
                            .style("flex-direction", "column")
                            .style("gap", "5px")
                            .style("touch-action", "none"); // Prevent default touch behaviors      

                        // Add zoom in button
                        zoomControls.append("button")
                            .attr("class", "zoom-button")
                            .style("padding", "8px")
                            .style("width", "32px")
                            .style("height", "32px")
                            .style("border", "1px solid #ccc")
                            .style("border-radius", "4px")
                            .style("background", "white")
                            .style("cursor", "pointer")
                            .style("display", "flex")
                            .style("align-items", "center")
                            .style("justify-content", "center")
                            .html("&plus;")
                            .on("click", () => {
                                const zoomSpeed = layout.props.zoomSpeed || 1.2;
                                zoomGlobe(zoomSpeed);
                            });
                        
                        // Add reset view (home) button in between
                        // Add reset view (home) button in between
                    zoomControls.append("button")
                        .attr("class", "zoom-button")
                        .style("padding", "8px")
                        .style("width", "32px")
                        .style("height", "32px")
                        .style("border", "1px solid #ccc")
                        .style("border-radius", "4px")
                        .style("background", "white")
                        .style("cursor", "pointer")
                        .style("display", "flex")
                        .style("align-items", "center")
                        .style("justify-content", "center")
                        .style("font-size", "18px")
                        .html(`<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                            <polyline points="9 22 9 12 15 12 15 22"></polyline>
                        </svg>`)
                        .on("click", () => {
                            // Clear country selections
                            globalSelectionState.countries.clear();
                            layers.countries.selectAll("path")
                                .attr("fill", layout.props.countryColor.color)
                                .attr("data-selected", "false");
                            
                            // Clear selections state
                            selectedOrigin = null;
                            selectedDestinations.clear();
                            globalSelectionState.selectedOrigin = null;
                            globalSelectionState.selectedDestinations.clear();

                            // Store initial values
                            const initialRotation = [0, -25, 0];
                            const initialScale = radius * (layout.props.initialZoom || 1);

                            // Update current state before animation
                            currentState = {
                                scale: initialScale,
                                rotation: initialRotation
                            };

                            // Animate to initial position
                            d3.transition()
                                .duration(1000)
                                .ease(d3.easeCubicInOut)
                                .tween("reset", () => {
                                    const rotationInterpolator = d3.interpolate(projection.rotate(), initialRotation);
                                    const scaleInterpolator = d3.interpolate(projection.scale(), initialScale);
                                    lastK = 1; // Reset zoom tracking
                                    
                                    return t => {
                                        const scale = scaleInterpolator(t);
                                        projection.rotate(rotationInterpolator(t))
                                                .scale(scale);
                                        
                                        layers.ocean.select("circle")
                                            .attr("r", scale);
                                        
                                        layers.countries.selectAll("path").attr("d", path);
                                        updateFlows();
                                        updateZoomIndicator(scale);
                                        updateVisualState();
                                    };
                                });
                        });
                        

                        // Add zoom out button 
                        zoomControls.append("button")
                            .attr("class", "zoom-button")
                            .style("padding", "8px")
                            .style("width", "32px")
                            .style("height", "32px")
                            .style("border", "1px solid #ccc")
                            .style("border-radius", "4px")
                            .style("background", "white")
                            .style("cursor", "pointer")
                            .style("display", "flex")
                            .style("align-items", "center")
                            .style("justify-content", "center")
                            .html("&minus;")
                            .on("click", () => {
                                const zoomSpeed = layout.props.zoomSpeed || 1.2;
                                zoomGlobe(1/zoomSpeed);
                            });
                        // Make zoom buttons larger for touch
                        zoomControls.selectAll("button")
                            .style("width", "40px")
                            .style("height", "40px")
                            .style("font-size", "20px")
                            .style("touch-action", "none");

                        // Add touch feedback styles to CSS
                        const style = document.createElement('style');
                        style.textContent = `
                            .zoom-button:active {
                                background-color: #e6e6e6 !important;
                                transform: scale(0.95);
                            }
                            
                            .zoom-controls {
                                -webkit-touch-callout: none;
                                -webkit-user-select: none;
                                -khtml-user-select: none;
                                -moz-user-select: none;
                                -ms-user-select: none;
                                user-select: none;
                            }
                        `;
                        document.head.appendChild(style);
 

                        // Add zoom percentage display
                        const zoomIndicator = zoomControls
                            .append("div")
                            .attr("class", "zoom-indicator")
                            .style("text-align", "center")
                            .style("margin", "5px 0");

                        function updateZoomIndicator(scale) {
                        const percentage = Math.round((scale / radius) * 100);
                        zoomIndicator.text(`${percentage}%`);
                        }
                        
                        // Add zoom function
                        function zoomGlobe(factor) {
                            const currentScale = projection.scale();
                            let newScale = currentScale * factor;
                            
                            // Enforce zoom limits
                            newScale = Math.max(minScale, Math.min(maxScale, newScale));
                            
                            // Store current rotation
                            const currentRotation = projection.rotate();
                            
                            // Apply new scale immediately to projection
                            projection.scale(newScale);
                            
                            // Update base elements
                            layers.ocean.select("circle").attr("r", newScale);
                            layers.countries.selectAll("path").attr("d", path);
                            
                            // Clear and redraw flows with new scale
                            layers.flows.selectAll("*").remove();
                            
                            flows.forEach(flow => {
                                const sourceVisible = isVisible(flow.origin.latitude, flow.origin.longitude, projection);
                                const targetVisible = isVisible(flow.destination.latitude, flow.destination.longitude, projection);
                                
                                if (sourceVisible || targetVisible) {
                                    const pathString = createFlowLine(flow.origin, flow.destination, projection);
                                    if (pathString) {
                                        layers.flows.append("path")
                                            .datum(flow)
                                            .attr("d", pathString)
                                            .attr("class", "flow-line")
                                            .attr("stroke", layout.props.flowLineColor.color)
                                            .attr("stroke-width", layout.props.baseLineWidth * Math.sqrt(flow.value || 1) * layout.props.lineWidthScale)
                                            .attr("fill", "none")
                                            .attr("opacity", layout.props.flowLineOpacity);
                                    }
                                }
                            });
                            
                            // Update points
                            layers.points.selectAll("*").remove();
                            updatePoints(layers, points, layout, projection);
                            
                            // Update zoom indicator
                            const zoomPercentage = Math.round((newScale / radius) * 100);
                            d3.select(".zoom-indicator").text(`${zoomPercentage}%`);
                            
                            // Clear path cache
                            clearPathCache();
                        }

                        // Add inertial scrolling
                        function smoothZoom(targetScale, duration = 300) {
                            const startScale = projection.scale();
                            d3.transition()
                                .duration(duration)
                                .ease(d3.easeQuadOut)
                                .tween("zoom", () => {
                                    const i = d3.interpolate(startScale, targetScale);
                                    return t => updateScale(i(t));
                                });
                        }

                        
                        // Replace the zoom and drag implementation with this combined version
                        function setupInteractions(svg, projection, layers, path, minScale, maxScale, layout) {
                            let isDragging = false;
                            let isAnimating = false;
                            let zoomScaleBase = projection.scale(); // Track base scale for zoom
                            
                            // Define a better wheel handler
                            function handleWheel(event) {
                                if (isAnimating) return;
                                event.preventDefault(); // Prevent page scrolling
                                
                                const zoomSpeed = layout.props.zoomSpeed || 1.2;
                                const delta = event.deltaY < 0 ? zoomSpeed : 1/zoomSpeed;
                                
                                const currentScale = projection.scale();
                                let newScale = currentScale * delta;
                                
                                // Enforce zoom limits
                                newScale = Math.max(minScale, Math.min(maxScale, newScale));
                                
                                // Get mouse position for zoom targeting
                                const mousePos = d3.pointer(event);
                                const targetPoint = projection.invert(mousePos);
                                
                                // Apply new scale
                                projection.scale(newScale);
                                
                                // Update visual elements
                                layers.ocean.select("circle").attr("r", newScale);
                                layers.countries.selectAll("path").attr("d", path);
                                updateFlows();
                                updateZoomIndicator(newScale);
                                
                                // Clear path cache on significant zoom changes
                                if (Math.abs(newScale - currentScale) > 20) {
                                    clearPathCache();
                                }
                            }
                            
                            // Drag behavior
                            const drag = d3.drag()
                                .on("start", () => {
                                    isDragging = true;
                                    // Disable zoom during drag to prevent conflicts
                                    svg.on("wheel.zoom", null);
                                })
                                .on("drag", (event) => {
                                    if (isAnimating) return;
                                    
                                    const rotate = projection.rotate();
                                    const k = 75 / projection.scale();
                                    
                                    projection.rotate([
                                        rotate[0] + event.dx * k,
                                        Math.max(-90, Math.min(90, rotate[1] - event.dy * k)),
                                        rotate[2]
                                    ]);
                                    
                                    layers.countries.selectAll("path").attr("d", path);
                                    updateFlows();
                                })
                                .on("end", () => {
                                    isDragging = false;
                                    // Re-enable wheel zoom after drag ends
                                    svg.on("wheel.zoom", handleWheel);
                                });
                            
                            // Apply the behaviors
                            svg.call(drag);
                            
                            // Explicitly handle wheel zooming
                            svg.on("wheel.zoom", handleWheel);
                            
                            // To handle touch zoom, we need separate touch handlers
                            let touchScale = 1;
                            let touchDistance = 0;
                            
                            svg.on("touchstart", (event) => {
                                if (event.touches.length === 2) {
                                    const dx = event.touches[0].pageX - event.touches[1].pageX;
                                    const dy = event.touches[0].pageY - event.touches[1].pageY;
                                    touchDistance = Math.sqrt(dx * dx + dy * dy);
                                    touchScale = projection.scale();
                                }
                            });
                            
                            svg.on("touchmove", (event) => {
                                if (isAnimating) return;
                                
                                if (event.touches.length === 2) {
                                    event.preventDefault();
                                    
                                    const dx = event.touches[0].pageX - event.touches[1].pageX;
                                    const dy = event.touches[0].pageY - event.touches[1].pageY;
                                    const newDistance = Math.sqrt(dx * dx + dy * dy);
                                    
                                    // Calculate new scale based on change in touch distance
                                    let newScale = touchScale * (newDistance / touchDistance);
                                    newScale = Math.max(minScale, Math.min(maxScale, newScale));
                                    
                                    projection.scale(newScale);
                                    layers.ocean.select("circle").attr("r", newScale);
                                    layers.countries.selectAll("path").attr("d", path);
                                    updateFlows();
                                    updateZoomIndicator(newScale);
                                }
                            });
                            
                            function startAnimation() {
                                isAnimating = true;
                                return new Promise(resolve => {
                                    setTimeout(() => {
                                        isAnimating = false;
                                        resolve();
                                    }, 1100); // Animation duration plus a little extra
                                });
                            }
                        }

  
                        // Update the svg click handler
                        svg.on("click", (event) => {
                            if (!layout.qHyperCube.qDimensionInfo[2].qLocked) {
                                const point = projection.invert([event.offsetX, event.offsetY]);
                                
                                // Rest of the click handler remains the same...
                            }
                        });

                        updateFlows();
    
                        // Add cleanup
                        $element.on('$destroy', function() {
                            d3.select("#globe-tooltip").remove();
                            svg.on(".zoom", null)
                               .on(".drag", null);
                        });

                        if (previousState.lastPoint) {
                            selectedOrigin = previousState.selectedOrigin;
                            selectedDestinations = new Set(previousState.selectedDestinations);
                            
                            requestAnimationFrame(() => {
                                updateCountryColors(previousState.lastPoint, layers, layout, worldData);
                                updateVisualState();
                            });
                        }

                    } catch (error) {
                        console.error('Error processing data:', error);
                        hideLoadingIndicator();
                        // Show error message to user
                        $element.html('<div class="error-message">Error loading visualization. Please try refreshing.</div>');
                      }
                        }).catch(error => {
                            console.error('Error fetching data:', error);
                            hideLoadingIndicator();
                            $element.html('<div class="error-message">Error loading data. Please try refreshing.</div>');
                        });
                 // After drawing countries and setting up the visualization
                // Restore selection state and colors
                

                return qlik.Promise.resolve();
            },
        resize: function($element, layout) {
        const $container = $('#globe-container-' + layout.qInfo.qId);
        const width = $container.width();
        const height = Math.min(width * 0.75, 600);
        
        $container.height(height);
        
        // Trigger repaint on resize
        this.paint($element, layout);
    },
    
    support: {
        snapshot: true,
        export: true,
        exportData: true
    }
    };
});