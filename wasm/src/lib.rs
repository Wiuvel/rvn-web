//! Resize image using crate `image` (PNG/JPEG/GIF).

use image::imageops::FilterType;
use std::io::Cursor;
use wasm_bindgen::prelude::*;

/// Resizes an image buffer to the specified dimensions.
///
/// # Arguments
/// * `input` - The input image data as a byte array.
/// * `width` - The target width.
/// * `height` - The target height.
///
/// # Returns
/// * `Result<Vec<u8>, JsError>` - The resized image data or an error.
#[wasm_bindgen]
pub fn resize_image(input: &[u8], width: u32, height: u32) -> Result<Vec<u8>, JsError> {
    if width == 0 || height == 0 {
        return Ok(input.to_vec());
    }

    // 1. Guess the format from the raw bytes
    let format = image::guess_format(input)
        .map_err(|e| JsError::new(&format!("Unknown format: {}", e)))?;

    // 2. Load the image from memory
    let img = image::load_from_memory(input)
        .map_err(|e| JsError::new(&format!("Failed to load image: {}", e)))?;

    // 3. Resize using Triangle filter (faster than Lanczos3, good enough for thumbnails/previews)
    // Using FilterType::Triangle (Bilinear) offers a good balance between performance and quality.
    let resized = img.resize_exact(width, height, FilterType::Triangle);

    let mut out = Vec::new();
    let mut cursor = Cursor::new(&mut out);

    // 4. Write the resized image back to a buffer in the same format
    resized
        .write_to(&mut cursor, format)
        .map_err(|e| JsError::new(&format!("Failed to write image: {}", e)))?;

    Ok(out)
}
