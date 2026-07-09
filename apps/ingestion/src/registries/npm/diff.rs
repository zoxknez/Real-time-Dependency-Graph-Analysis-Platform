use std::collections::HashSet;

#[derive(Debug)]
pub struct DiffResult {
    pub new_versions: Vec<String>,
    pub yanked_versions: Vec<String>,
    pub is_new_package: bool,
}

pub fn calculate_diff(old_versions: &[String], new_versions: &[String]) -> DiffResult {
    let old_set: HashSet<_> = old_versions.iter().collect();
    let new_set: HashSet<_> = new_versions.iter().collect();

    let new_v: Vec<String> = new_versions.iter()
        .filter(|v| !old_set.contains(v)) // Note: &String logic
        .cloned()
        .collect();

    let yanked_v: Vec<String> = old_versions
        .iter()
        .filter(|v| !new_set.contains(v))
        .cloned()
        .collect();

    DiffResult {
        new_versions: new_v,
        yanked_versions: yanked_v,
        is_new_package: old_versions.is_empty(),
    }
}
