/**
 * Tritone Effect — Block Editor Integration
 *
 * No build step. Uses WordPress globals (wp.*) available in the editor.
 *
 * Mirrors the official Duotone control pattern:
 *   Toolbar → Dropdown → MenuGroup → TritoneBody
 *   Sidebar → InspectorControls (Styles tab) → ToolsPanel → ToolsPanelItem
 *
 * Only public wp.components are used. CircularOptionPicker is intentionally
 * private in Gutenberg, so presets use plain accessible buttons styled to
 * match the editor's circular swatch convention.
 */
( function () {
	'use strict';

	// ── Safety guard ──────────────────────────────────────────────────────────
	if (
		! window.wp ||
		! wp.hooks || ! wp.compose || ! wp.element ||
		! wp.blockEditor || ! wp.components || ! wp.data || ! wp.i18n
	) {
		return;
	}

	const { addFilter }                         = wp.hooks;
	const { createHigherOrderComponent }        = wp.compose;
	const { Fragment, createElement, useState, useEffect } = wp.element;
	const { InspectorControls, BlockControls }  = wp.blockEditor;
	const { __ }                                = wp.i18n;

	// ── Public wp.components used ─────────────────────────────────────────────
	const ToolsPanel     = wp.components.ToolsPanel     || wp.components.__experimentalToolsPanel     || null;
	const ToolsPanelItem = wp.components.ToolsPanelItem || wp.components.__experimentalToolsPanelItem || null;

	const {
		Dropdown,
		ToolbarButton,
		Button,
		ColorPalette,
		ColorIndicator,
		MenuGroup,
		PanelBody,
	} = wp.components;

	// ── Data ──────────────────────────────────────────────────────────────────
	const presets        = ( window.tritoneData && window.tritoneData.presets ) ? window.tritoneData.presets : [];
	const DEFAULT_COLORS = [ '#000000', '#808080', '#ffffff' ];

	const TRITONE_BLOCKS = {
		'core/image':               'img',
		'core/cover':               '.wp-block-cover__image-background',
		'core/site-logo':           'img',
		'core/post-featured-image': 'img',
		'core/avatar':              'img',
	};

	// ── Helpers ───────────────────────────────────────────────────────────────

	function hexToRgb( hex ) {
		const h = hex.replace( '#', '' );
		return [
			parseInt( h.substring( 0, 2 ), 16 ) / 255,
			parseInt( h.substring( 2, 4 ), 16 ) / 255,
			parseInt( h.substring( 4, 6 ), 16 ) / 255,
		];
	}

	function makeFilterId( colors ) {
		return 'te-' + colors.join( '' ).replace( /#/g, '' ).toLowerCase();
	}

	function buildSvgFilter( id, colors ) {
		const [ shadow, midtone, highlight ] = colors;
		const [ sr, sg, sb ] = hexToRgb( shadow );
		const [ mr, mg, mb ] = hexToRgb( midtone );
		const [ hr, hg, hb ] = hexToRgb( highlight );
		const f = v => v.toFixed( 5 );

		return createElement( 'svg', {
			key: 'te-svg-' + id, xmlns: 'http://www.w3.org/2000/svg',
			style: { position: 'absolute', width: 0, height: 0, overflow: 'hidden' },
			'aria-hidden': 'true',
		},
			createElement( 'defs', null,
				createElement( 'filter', {
					id, colorInterpolationFilters: 'sRGB',
					x: '0%', y: '0%', width: '100%', height: '100%',
				},
					createElement( 'feColorMatrix', { type: 'saturate', values: '0', result: 'gray' } ),
					createElement( 'feComponentTransfer', { in: 'gray', colorInterpolationFilters: 'sRGB' },
						createElement( 'feFuncR', { type: 'table', tableValues: `${ f(sr) } ${ f(mr) } ${ f(hr) }` } ),
						createElement( 'feFuncG', { type: 'table', tableValues: `${ f(sg) } ${ f(mg) } ${ f(hg) }` } ),
						createElement( 'feFuncB', { type: 'table', tableValues: `${ f(sb) } ${ f(mb) } ${ f(hb) }` } ),
					)
				)
			)
		);
	}

	function getThemeColors() {
		try {
			return wp.data.select( 'core/block-editor' ).getSettings().colors || [];
		} catch ( e ) {
			return [];
		}
	}

	// ── Toolbar icon ──────────────────────────────────────────────────────────
	// Inline copy of the 'color' icon from @wordpress/icons.
	// Embedded so no wp-icons script dependency is needed.

	function TritoneIcon() {
		return createElement( 'svg', {
			xmlns: 'http://www.w3.org/2000/svg', width: 24, height: 24,
			viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false',
		},
			createElement( 'path', {
				d: 'M17.2 10.9c-.5-1-1.2-2.1-2.1-3.2-.6-.9-1.3-1.7-2.1-2.6L12 4l-1 1.1c-.6.9-1.3 1.7-2 2.6-.8 1.2-1.5 2.3-2 3.2-.6 1.2-1 2.2-1 3 0 3.4 2.7 6.1 6.1 6.1s6.1-2.7 6.1-6.1c0-.8-.3-1.8-1-3zm-5.1 7.6c-2.5 0-4.6-2.1-4.6-4.6 0-.3.1-1 .8-2.3.5-.9 1.1-1.9 2-3.1.7-.9 1.3-1.7 1.8-2.3.7.8 1.3 1.6 1.8 2.3.8 1.1 1.5 2.2 2 3.1.7 1.3.8 2 .8 2.3 0 2.5-2.1 4.6-4.6 4.6z',
			} )
		);
	}

	// ── Swatch — uses Gutenberg's own CircularOptionPicker CSS classes ───────
	// We can't import the React component (it's private), but we can reuse its
	// public CSS classes so size, padding, hover scale, ring colour, transition,
	// and selected ring all match Gutenberg's official swatch styling exactly.

	function Swatch( { isActive, ariaLabel, onClick, background } ) {
		return createElement( 'div', {
			className: 'components-circular-option-picker__option-wrapper',
		},
			createElement( 'button', {
				type: 'button',
				'aria-label': ariaLabel,
				'aria-pressed': isActive ? true : undefined,
				onClick,
				className: 'components-button components-circular-option-picker__option',
				// Gutenberg's CSS sets `box-shadow: inset 0 0 0 14px currentColor`
				// which would fill the whole circle with text colour, hiding our
				// background. We override box-shadow inline to control the ring
				// directly: thin gray when unselected, blue ring when selected.
				style: {
					background,
					boxShadow: isActive
						? '0 0 0 3px #fff, 0 0 0 5px var(--wp-admin-theme-color, #3858e9)'
						: 'inset 0 0 0 1px rgba(0,0,0,0.2)',
				},
			} )
		);
	}

	// ── Gradient preview bar ──────────────────────────────────────────────────

	function GradientBar( { colors } ) {
		const [ shadow, midtone, highlight ] = colors;
		const handle = ( color, left ) => createElement( 'div', {
			style: {
				position: 'absolute', left, top: '50%',
				transform: left === '50%' ? 'translate(-50%,-50%)' : 'translateY(-50%)',
				width: 16, height: 16, borderRadius: '50%',
				background: color,
				border: '2px solid rgba(255,255,255,.9)',
				boxShadow: '0 0 0 1px rgba(0,0,0,.25)',
				pointerEvents: 'none',
			},
		} );

		return createElement( 'div', {
			style: {
				position: 'relative', height: 28, borderRadius: 4,
				background: `linear-gradient(to right, ${ shadow }, ${ midtone } 50%, ${ highlight })`,
				margin: '0 0 12px',
			},
		},
			handle( shadow,    '8px' ),
			handle( midtone,   '50%' ),
			handle( highlight, 'calc(100% - 8px)' ),
		);
	}

	// ── TritoneBody ───────────────────────────────────────────────────────────
	// Preset swatches use plain <button> elements styled to match the editor's
	// circular swatch convention (CircularOptionPicker is private in Gutenberg).
	// Color stops use the public ColorPalette + ColorIndicator components.

	function TritoneBody( { tritoneColors, tritoneEnabled, setAttributes } ) {
		const [ openStop, setOpenStop ] = useState( null );
		const themeColors = getThemeColors();

		const stops = [
			{ label: __( 'Shadow' ),    index: 0 },
			{ label: __( 'Midtone' ),   index: 1 },
			{ label: __( 'Highlight' ), index: 2 },
		];

		return createElement( Fragment, null,

			// ── Preset swatches row ───────────────────────────────────────────
			// Uses Gutenberg's own CircularOptionPicker CSS scope so every swatch
			// inherits identical sizing, padding, ring colour, hover scale, and
			// selected-state ring — matching Duotone pixel-for-pixel.
			//
			// The inline <style> below cancels Gutenberg's hover background tint
			// for our buttons (it would otherwise paint each swatch solid blue
			// on hover). The wrapper's `transform: scale` hover animation is on
			// a separate property and still fires.
			createElement( 'style', null,
				// Cancel the colour-shift on hover/focus while preserving the
				// transform: scale animation (which is on the wrapper).
				// Selected swatch keeps its blue ring on hover.
				'.te-swatches .components-circular-option-picker__option:hover,' +
				'.te-swatches .components-circular-option-picker__option:focus{' +
					'color:inherit!important;' +
				'}' +
				'.te-swatches .components-circular-option-picker__option:not([aria-pressed="true"]):hover,' +
				'.te-swatches .components-circular-option-picker__option:not([aria-pressed="true"]):focus{' +
					'box-shadow:inset 0 0 0 1px rgba(0,0,0,0.2)!important;' +
				'}' +
				'.te-swatches .components-circular-option-picker__option[aria-pressed="true"]:hover,' +
				'.te-swatches .components-circular-option-picker__option[aria-pressed="true"]:focus{' +
					'box-shadow:0 0 0 3px #fff,0 0 0 5px var(--wp-admin-theme-color,#3858e9)!important;' +
				'}'
			),
			createElement( 'div', {
				className: 'components-circular-option-picker te-swatches',
				style: { marginBottom: 16 },
			},
				createElement( 'div', { className: 'components-circular-option-picker__swatches' },

					// "None" swatch — Duotone uses a CSS diagonal-line gradient,
					// never enters the is-pressed state (it's a clear action).
					createElement( Swatch, {
						ariaLabel: __( 'No tritone' ),
						isActive: false,
						onClick: () => setAttributes( { tritoneEnabled: false, tritoneColors: DEFAULT_COLORS } ),
						background: '#fff linear-gradient(-45deg, transparent 48%, #ddd 48%, #ddd 52%, transparent 52%)',
					} ),

					// Preset swatches
					...presets.map( preset => {
						const isActive = tritoneEnabled && tritoneColors.join( ',' ) === preset.colors.join( ',' );
						return createElement( Swatch, {
							key: preset.slug,
							ariaLabel: preset.name,
							isActive,
							onClick: () => setAttributes( { tritoneEnabled: true, tritoneColors: preset.colors } ),
							background: `conic-gradient(${ preset.colors[0] } 0deg 120deg, ${ preset.colors[1] } 120deg 240deg, ${ preset.colors[2] } 240deg 360deg)`,
						} );
					} )
				)
			),

			// ── Gradient preview bar (only when a tritone is active) ──────────
			tritoneEnabled ? createElement( GradientBar, { colors: tritoneColors } ) : null,

			// ── Colour stops (Shadow / Midtone / Highlight) ───────────────────
			// Accordion pattern: one ColorPalette open at a time.
			createElement( 'div', { style: { overflow: 'hidden' } },
				stops.map( ( stop, i ) => {
					const isOpen   = openStop === stop.index;
					const curColor = tritoneColors[ stop.index ] || DEFAULT_COLORS[ stop.index ];

					return createElement( Fragment, { key: stop.label },

						// Row header button
						createElement( 'button', {
							type: 'button',
							'aria-expanded': isOpen,
							onClick: () => setOpenStop( isOpen ? null : stop.index ),
							style: {
								display: 'flex', alignItems: 'center', gap: 12,
								width: '100%', padding: '10px 0',
								background: 'none', cursor: 'pointer', textAlign: 'left',
								border: 'none',
							},
						},
							createElement( ColorIndicator, { colorValue: curColor } ),
							createElement( 'span', { style: { fontSize: 13, color: '#1e1e1e' } }, stop.label ),
						),

						// Expanded ColorPalette
						isOpen ? createElement( 'div', {
							style: { paddingBottom: 12 },
						},
							createElement( ColorPalette, {
								colors:    themeColors,
								value:     curColor,
								clearable: false,
								onChange:  color => {
									const next = [ ...tritoneColors ];
									next[ stop.index ] = color || DEFAULT_COLORS[ stop.index ];
									setAttributes( { tritoneColors: next, tritoneEnabled: true } );
								},
							} )
						) : null,
					);
				} )
			),
		);
	}

	// ── Step 1 — Register block attributes ────────────────────────────────────

	addFilter(
		'blocks.registerBlockType',
		'tritone-effect/attributes',
		function ( settings, name ) {
			if ( ! Object.prototype.hasOwnProperty.call( TRITONE_BLOCKS, name ) ) return settings;
			return Object.assign( {}, settings, {
				attributes: Object.assign( {}, settings.attributes, {
					tritoneEnabled: { type: 'boolean', default: false },
					tritoneColors:  { type: 'array', default: DEFAULT_COLORS, items: { type: 'string' } },
				} ),
			} );
		}
	);

	// ── Step 2 — HOC: toolbar + sidebar + canvas preview ─────────────────────

	const withTritone = createHigherOrderComponent( function ( BlockEdit ) {
		return function TritoneBlockEdit( props ) {
			if ( ! Object.prototype.hasOwnProperty.call( TRITONE_BLOCKS, props.name ) ) {
				return createElement( BlockEdit, props );
			}

			const { attributes, setAttributes, clientId } = props;
			const { tritoneEnabled, tritoneColors = DEFAULT_COLORS } = attributes;
			const imgSelector = TRITONE_BLOCKS[ props.name ];
			const fid = tritoneEnabled ? makeFilterId( tritoneColors ) : null;

			// ── Mutual exclusion with core Duotone ────────────────────────────
			// Tritone and Duotone are two different mappings of the same image
			// channel and must never apply together. We enforce this in two
			// directions:
			//   1. When *enabling* Tritone, we strip any existing duotone
			//      attribute in the same setAttributes call (no race).
			//   2. When the user applies Duotone via core's toolbar, the
			//      duotone attribute changes externally — a useEffect watches
			//      that change and clears Tritone.

			const duotone = attributes.style && attributes.style.color
				? attributes.style.color.duotone
				: undefined;

			// Wrapped setAttributes: when enabling Tritone, also clear duotone.
			const applyTritone = function ( newAttrs ) {
				if ( newAttrs.tritoneEnabled && duotone ) {
					const colorRest = Object.assign( {}, attributes.style && attributes.style.color );
					delete colorRest.duotone;
					const newStyle = Object.assign( {}, attributes.style );
					if ( Object.keys( colorRest ).length > 0 ) {
						newStyle.color = colorRest;
					} else {
						delete newStyle.color;
					}
					setAttributes( Object.assign( {}, newAttrs, { style: newStyle } ) );
				} else {
					setAttributes( newAttrs );
				}
			};

			// Watch for externally-applied Duotone and clear Tritone.
			useEffect( function () {
				if ( duotone && tritoneEnabled ) {
					setAttributes( {
						tritoneEnabled: false,
						tritoneColors:  DEFAULT_COLORS,
					} );
				}
			// eslint-disable-next-line react-hooks/exhaustive-deps
			}, [ duotone ] );

			// ── Toolbar button ────────────────────────────────────────────────
			// Mirrors the duotone-control pattern:
			//   Dropdown > renderContent > MenuGroup > description + TritoneBody
			const toolbar = createElement( BlockControls, { group: 'other' },
				createElement( Dropdown, {
					popoverProps: { placement: 'bottom-start', offset: 8 },
					renderToggle: ( { onToggle, isOpen } ) =>
						createElement( ToolbarButton, {
							label:    __( 'Tritone' ),
							icon:     createElement( TritoneIcon, null ),
							onClick:  onToggle,
							isActive: isOpen || tritoneEnabled,
						} ),
					renderContent: () =>
						createElement( 'div', { style: { width: 260, padding: 8 } },
							createElement( MenuGroup, null,
								// Manual label — avoids the extra 8px horizontal padding that
								// components-menu-group__label CSS adds in the toolbar context.
								createElement( 'div', {
									style: {
										fontSize: 11, fontWeight: 500,
										textTransform: 'uppercase', letterSpacing: 'normal',
										margin: '4px 0 12px', color: 'rgb(117, 117, 117)',
										whiteSpace: 'nowrap',
									},
								}, __( 'Tritone' ) ),
								createElement( 'p', {
									style: { margin: '13px 0', fontSize: 13, lineHeight: '19.5px' },
								}, __( 'Create a three-tone color effect without losing your original image.' ) ),
								createElement( TritoneBody, { tritoneColors, tritoneEnabled, setAttributes: applyTritone } ),
								tritoneEnabled
									? createElement( 'div', { style: { textAlign: 'right', marginTop: 8 } },
										createElement( Button, {
											variant: 'tertiary',
											onClick: () => setAttributes( { tritoneEnabled: false, tritoneColors: DEFAULT_COLORS } ),
										}, __( 'Clear' ) )
									  )
									: null,
							)
						),
				} )
			);

			// ── Sidebar panel (Styles tab) ────────────────────────────────────
			let panel;
			if ( ToolsPanel && ToolsPanelItem ) {
				panel = createElement( InspectorControls, { group: 'styles' },
					createElement( ToolsPanel, {
						label:    __( 'Tritone' ),
						panelId:  clientId,
						resetAll: () => setAttributes( { tritoneEnabled: false, tritoneColors: DEFAULT_COLORS } ),
					},
						createElement( ToolsPanelItem, {
							label:            __( 'Tritone' ),
							panelId:          clientId,
							hasValue:         () => !! tritoneEnabled,
							onDeselect:       () => setAttributes( { tritoneEnabled: false } ),
							isShownByDefault: false,
						},
							createElement( TritoneBody, { tritoneColors, tritoneEnabled, setAttributes: applyTritone } ),
						)
					)
				);
			} else {
				panel = createElement( InspectorControls, null,
					createElement( PanelBody, { title: __( 'Tritone' ), initialOpen: false },
						createElement( TritoneBody, { tritoneColors, tritoneEnabled, setAttributes: applyTritone } ),
					)
				);
			}

			// ── Canvas preview ────────────────────────────────────────────────
			if ( ! fid ) {
				return createElement( Fragment, null, toolbar, panel, createElement( BlockEdit, props ) );
			}

			const filterStyle = createElement( 'style', { key: 'te-style-' + clientId },
				`[data-block="${ clientId }"] ${ imgSelector } { filter: url(#${ fid }) !important; }`
			);

			return createElement( Fragment, null,
				toolbar,
				panel,
				buildSvgFilter( fid, tritoneColors ),
				filterStyle,
				createElement( BlockEdit, props ),
			);
		};
	}, 'withTritone' );

	addFilter( 'editor.BlockEdit', 'tritone-effect/edit', withTritone );

} )();
