fn main() -> Result<(), Box<dyn std::error::Error>> {
    let protoc = protoc_bin_vendored::protoc_bin_path()?;
    let proto_root = "../../proto";

    let mut config = prost_build::Config::new();
    config.protoc_executable(protoc);
    config.type_attribute(".", "#[allow(dead_code)]");
    config.compile_protos(
        &[
            format!("{}/shared/event/v1/event_meta.proto", proto_root),
            format!("{}/domain/package/v1/package_events.proto", proto_root),
        ],
        &[proto_root],
    )?;

    println!("cargo:rerun-if-changed={}", proto_root);

    Ok(())
}
