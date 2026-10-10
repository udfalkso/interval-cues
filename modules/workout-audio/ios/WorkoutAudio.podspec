Pod::Spec.new do |s|
  s.name = 'WorkoutAudio'
  s.version = '1.0.0'
  s.summary = 'Native background workout clock and spoken cues'
  s.description = s.summary
  s.license = { :type => 'MIT' }
  s.author = 'Udi'
  s.homepage = 'https://expo.dev'
  s.platforms = { :ios => '15.1' }
  s.source = { :path => '.' }
  s.static_framework = true
  s.swift_version = '5.9'
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
  s.resource_bundles = { 'WorkoutAudioResources' => ['silence.wav'] }
end
