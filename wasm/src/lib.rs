//! Image processing for Next.js media cache and ThumbHash generation.

use image::imageops::FilterType;
use image::GenericImageView;
use std::io::Cursor;
use wasm_bindgen::prelude::*;

#[derive(serde::Serialize)]
pub struct ImageMetadata {
    pub width: u32,
    pub height: u32,
    pub thumbhash: String,
}

/// Resizes an image buffer to the specified dimensions.
#[wasm_bindgen]
pub fn resize_image(input: &[u8], width: u32, height: u32) -> Result<Vec<u8>, JsError> {
    if width == 0 || height == 0 {
        return Ok(input.to_vec());
    }

    let format = image::guess_format(input)
        .map_err(|e| JsError::new(&format!("Unknown format: {}", e)))?;

    let img = image::load_from_memory(input)
        .map_err(|e| JsError::new(&format!("Failed to load image: {}", e)))?;

    let resized = img.resize_exact(width, height, FilterType::Triangle);

    let mut out = Vec::new();
    let mut cursor = Cursor::new(&mut out);

    resized
        .write_to(&mut cursor, format)
        .map_err(|e| JsError::new(&format!("Failed to write image: {}", e)))?;

    Ok(out)
}

/// Generates a ThumbHash for an image and returns metadata (width, height, hash).
/// 
/// The image is automatically resized to a max dimension of 100px before hashing
/// to improve performance, as ThumbHash doesn't need high resolution.
#[wasm_bindgen]
pub fn generate_thumbhash(input: &[u8]) -> Result<JsValue, JsError> {
    // 1. Load image
    let img = image::load_from_memory(input)
        .map_err(|e| JsError::new(&format!("Failed to load image: {}", e)))?;
    
    let (width, height) = img.dimensions();

    // 2. Resize for ThumbHash (max 100x100 is enough for hash generation)
    // We maintain aspect ratio
    let thumbnail = img.resize(100, 100, FilterType::Triangle);
    let (thumb_width, thumb_height) = thumbnail.dimensions();

    // 3. Convert to RGBA8 buffer
    let rgba = thumbnail.to_rgba8();
    
    // 4. Generate ThumbHash
    let hash_bytes = thumbhash::rgba_to_thumb_hash(
        thumb_width as usize, 
        thumb_height as usize, 
        &rgba.into_raw()
    );

    // 5. Encode to Base64
    use base64::{Engine as _, engine::general_purpose};
    let hash_string = general_purpose::STANDARD.encode(&hash_bytes);

    // 6. Return result
    let metadata = ImageMetadata {
        width,
        height,
        thumbhash: hash_string,
    };

    Ok(serde_wasm_bindgen::to_value(&metadata)?)
}
