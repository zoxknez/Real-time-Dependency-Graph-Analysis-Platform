fn main() -> Result<(), Box<dyn std::error::Error>> {
    std::env::set_var("PROTOC", protoc_bin_vendored::protoc_bin_path().unwrap());
    tonic_build::configure()
        .build_server(false)
        .build_client(false)
        .out_dir("src/generated")
        .compile(
            &["../../proto/domain/tenant/v1/tenant.proto"],
            &["../../proto"],
        )?;
    Ok(())
}
