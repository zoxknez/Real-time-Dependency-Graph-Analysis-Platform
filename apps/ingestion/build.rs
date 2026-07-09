// Build script for compiling Protocol Buffers
//
// This build script uses tonic-build to compile .proto files into Rust code.
// The generated code will be available as prost-generated types at compile time.

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let protoc = protoc_bin_vendored::protoc_bin_path()?;
    let proto_root = "../../proto";

    let mut config = prost_build::Config::new();
    config.protoc_executable(protoc);
    config.compile_protos(
        &[
            // Shared event metadata
            format!("{}/shared/event/v1/event_meta.proto", proto_root),
            // Raw npm events
            format!("{}/raw/npm/v1/change.proto", proto_root),
            // Domain package events
            format!("{}/domain/package/v1/package_events.proto", proto_root),
        ],
        &[proto_root],
    )?;

    // Rebuild if proto files change
    println!("cargo:rerun-if-changed={}", proto_root);

    Ok(())
}
