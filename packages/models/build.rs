fn main() -> Result<(), Box<dyn std::error::Error>> {
    let protoc = protoc_bin_vendored::protoc_bin_path()?;
    let mut config = prost_build::Config::new();
    config.protoc_executable(protoc);
    config.out_dir("src/generated");
    config.compile_protos(
        &["../../proto/domain/tenant/v1/tenant.proto"],
        &["../../proto"],
    )?;
    Ok(())
}
