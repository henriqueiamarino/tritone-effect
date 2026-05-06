<?php
/**
 * Plugin Name: Tritone Effect
 * Description: Adds a three-color gradient mapping effect (shadow, midtone, highlight) to Image, Cover, Site Logo, Featured Image, and Avatar blocks — like duotone but with a midtone stop. Presets are defined per theme in theme.json under settings.custom.tritone using the same colors[] convention as core duotone.
 * Version:     0.2.1
 * Requires at least: 6.3
 * Author:      HVAC Theme
 */

defined( 'ABSPATH' ) || exit;

// ---------------------------------------------------------------------------
// 1. Enqueue the block editor script
// ---------------------------------------------------------------------------

add_action( 'enqueue_block_editor_assets', function () {
	wp_enqueue_script(
		'tritone-editor',
		plugin_dir_url( __FILE__ ) . 'editor.js',
		[ 'wp-blocks', 'wp-element', 'wp-hooks', 'wp-components', 'wp-compose', 'wp-block-editor', 'wp-i18n', 'wp-data' ],
		filemtime( plugin_dir_path( __FILE__ ) . 'editor.js' ),
		true
	);

	wp_localize_script( 'tritone-editor', 'tritoneData', [
		'presets' => array_values( tritone_get_presets() ),
	] );
} );

// ---------------------------------------------------------------------------
// 2. Override the editor block-selection outline colour in the canvas iframe
// ---------------------------------------------------------------------------

add_filter( 'block_editor_settings_all', function ( array $settings ): array {
	$settings['styles'][] = [
		'css' => '
			.block-editor-block-list__block.is-selected > *,
			.block-editor-block-list__block.is-highlighted > * {
				--wp-admin-theme-color: #3f57e1;
			}
			/* The selection outline itself is drawn by this custom property */
			.block-editor-block-list__block.is-selected::after,
			.block-editor-block-list__block.is-highlighted::after,
			.block-editor-block-list__block.is-selected .block-editor-block-list__block-selection-button {
				--wp-admin-theme-color: #3f57e1;
				box-shadow: 0 0 0 var(--wp-admin-border-width-focus, 3px) #3f57e1 !important;
			}
		',
	];
	return $settings;
} );

// ---------------------------------------------------------------------------
// 3. Read tritone presets — from theme.json custom.tritone, or fallback list
// ---------------------------------------------------------------------------

function tritone_get_presets(): array {
	// Prefer presets defined by the active theme in theme.json under "custom.tritone"
	if ( class_exists( 'WP_Theme_JSON_Resolver' ) ) {
		$settings = WP_Theme_JSON_Resolver::get_merged_data()->get_settings();
		if ( ! empty( $settings['custom']['tritone'] ) && is_array( $settings['custom']['tritone'] ) ) {
			return $settings['custom']['tritone'];
		}
	}

	// Hardcoded fallback (shown when theme.json has no custom.tritone section).
	// Format mirrors core duotone: a "colors" array — [ shadow, midtone, highlight ].
	return [
		[ 'slug' => 'blue-dusk',  'name' => 'Blue Dusk',  'colors' => [ '#001133', '#00BFFF', '#FF3333' ] ],
		[ 'slug' => 'neon-sun',   'name' => 'Neon Sun',   'colors' => [ '#020422', '#E61AC3', '#FFFF00' ] ],
		[ 'slug' => 'green-west', 'name' => 'Green West', 'colors' => [ '#18171C', '#B8997A', '#E6FCCF' ] ],
		[ 'slug' => 'moon-veil',  'name' => 'Moon Veil',  'colors' => [ '#00081A', '#8592AD', '#C2C9D6' ] ],
		[ 'slug' => 'ember-glow', 'name' => 'Ember Glow', 'colors' => [ '#0D0221', '#B5451B', '#F5C518' ] ],
	];
}

// ---------------------------------------------------------------------------
// 4. Frontend rendering — inject SVG filter for all supported block types
// ---------------------------------------------------------------------------

/**
 * Maps each supported block name to the CSS selector for the image element
 * inside its rendered HTML. Keeps text overlays (e.g. Cover titles) untinted.
 */
function tritone_block_image_selector( string $block_name ): string {
	$map = [
		'core/image'               => 'img',
		'core/cover'               => '.wp-block-cover__image-background',
		'core/site-logo'           => 'img',
		'core/post-featured-image' => 'img',
		'core/avatar'              => 'img',
	];
	return $map[ $block_name ] ?? '';
}

add_filter( 'render_block', function ( string $html, array $block ): string {
	// Skip unsupported block types immediately
	$img_selector = tritone_block_image_selector( $block['blockName'] ?? '' );
	if ( ! $img_selector ) {
		return $html;
	}

	$attrs = $block['attrs'];

	if ( empty( $attrs['tritoneEnabled'] ) ) {
		return $html;
	}

	// Support both the new colors[] array and the legacy shadow/midtone/highlight keys.
	$colors    = $attrs['tritoneColors'] ?? [];
	$shadow    = sanitize_hex_color( $colors[0] ?? $attrs['tritoneShadow']    ?? '' );
	$midtone   = sanitize_hex_color( $colors[1] ?? $attrs['tritoneMidtone']   ?? '' );
	$highlight = sanitize_hex_color( $colors[2] ?? $attrs['tritoneHighlight'] ?? '' );

	if ( ! $shadow || ! $midtone || ! $highlight ) {
		return $html;
	}

	// Generate a stable, unique ID for this colour combination
	$id = 'te-' . substr( md5( $shadow . $midtone . $highlight ), 0, 8 );

	// Only print the SVG definition once per page, even if the same colours appear multiple times
	static $printed = [];
	$svg = '';
	if ( ! isset( $printed[ $id ] ) ) {
		$svg = tritone_svg( $id, $shadow, $midtone, $highlight );
		$printed[ $id ] = true;
	}

	/**
	 * Scope the CSS filter to this specific block instance by adding a unique
	 * class (te-i1, te-i2, …) to its outermost element. This avoids two bugs
	 * with a generic block-name selector:
	 *   a) .wp-block-image img would tint every image on the page, not just
	 *      the tritone-enabled one.
	 *   b) The old str_replace logic produced .wp-block-core-image (wrong class).
	 */
	static $instance = 0;
	$inst_class = 'te-i' . ( ++$instance );

	// Prepend the instance class to the outermost element's class attribute,
	// or add a new class attribute if none exists yet.
	if ( preg_match( '/<[^>]+\bclass="/', $html ) ) {
		$html = preg_replace( '/(<[^>]+\bclass=")/', '$1' . $inst_class . ' ', $html, 1 );
	} else {
		$html = preg_replace( '/(<[a-z][a-z0-9-]*\b)/', '$1 class="' . $inst_class . '"', $html, 1 );
	}

	// CSS rule scoped to this instance — targets only the image element,
	// never text overlays (e.g. inside Cover blocks).
	$style = '<style>.' . $inst_class . ' ' . $img_selector . '{filter:url(#' . esc_attr( $id ) . ')}</style>';

	return $svg . $style . $html;
}, 10, 2 );

// ---------------------------------------------------------------------------
// 5. SVG filter builder
// ---------------------------------------------------------------------------

function tritone_hex_to_rgb( string $hex ): array {
	$hex = ltrim( $hex, '#' );
	if ( strlen( $hex ) === 3 ) {
		$hex = $hex[0] . $hex[0] . $hex[1] . $hex[1] . $hex[2] . $hex[2];
	}
	return [
		hexdec( substr( $hex, 0, 2 ) ) / 255,
		hexdec( substr( $hex, 2, 2 ) ) / 255,
		hexdec( substr( $hex, 4, 2 ) ) / 255,
	];
}

function tritone_svg( string $id, string $shadow, string $midtone, string $highlight ): string {
	[ $sr, $sg, $sb ] = tritone_hex_to_rgb( $shadow );
	[ $mr, $mg, $mb ] = tritone_hex_to_rgb( $midtone );
	[ $hr, $hg, $hb ] = tritone_hex_to_rgb( $highlight );

	$f = fn( float $v ): string => number_format( $v, 5, '.', '' );

	return sprintf(
		'<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0;overflow:hidden;" aria-hidden="true">
  <defs>
    <filter id="%1$s" color-interpolation-filters="sRGB" x="0%%" y="0%%" width="100%%" height="100%%">
      <feColorMatrix type="saturate" values="0" result="gray"/>
      <feComponentTransfer in="gray" color-interpolation-filters="sRGB">
        <feFuncR type="table" tableValues="%2$s %3$s %4$s"/>
        <feFuncG type="table" tableValues="%5$s %6$s %7$s"/>
        <feFuncB type="table" tableValues="%8$s %9$s %10$s"/>
      </feComponentTransfer>
    </filter>
  </defs>
</svg>',
		esc_attr( $id ),
		$f( $sr ), $f( $mr ), $f( $hr ),
		$f( $sg ), $f( $mg ), $f( $hg ),
		$f( $sb ), $f( $mb ), $f( $hb )
	);
}
