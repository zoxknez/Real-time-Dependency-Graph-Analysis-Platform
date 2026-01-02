// Build script for compiling Protocol Buffers
//
// This build script uses tonic-build to compile .proto files into Rust code.
// The generated code will be available as prost-generated types at compile time.

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let proto_root = "../../proto";

    // Configure the protobuf compiler
    tonic_build::configure()
        // We only need message types, not gRPC server code
        .build_server(false)
        // We don't need client code either (just data structures)
        .build_client(false)
        // Compile all proto files needed for consuming events
        .compile_protos(
            &[
                // Shared event metadata
                format!("{}/shared/event/v1/event_meta.proto", proto_root),
                // Domain package events (all event types)
                format!("{}/domain/package/v1/package_events.proto", proto_root),
            ],
            // Include paths for imports
            &[proto_root],
        )?;

    // Rebuild if proto files change
    println!("cargo:rerun-if-changed={}", proto_root);
    
    Ok(())
}
