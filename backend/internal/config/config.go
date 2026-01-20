package config

import (
	"time"

	"github.com/spf13/viper"
)

type Config struct {
	Server   ServerConfig   `mapstructure:"server"`
	Database DatabaseConfig `mapstructure:"database"`
	Pool     PoolConfig     `mapstructure:"pool"`
}

type ServerConfig struct {
	Addr         string        `mapstructure:"addr"`
	ReadTimeout  time.Duration `mapstructure:"read_timeout"`
	WriteTimeout time.Duration `mapstructure:"write_timeout"`
	IdleTimeout  time.Duration `mapstructure:"idle_timeout"`
}

type DatabaseConfig struct {
	Path string `mapstructure:"path"`
}

type PoolConfig struct {
	MaxConnections int           `mapstructure:"max_connections"`
	MaxPoolSize    int           `mapstructure:"max_pool_size"`
	MaxLifetime    time.Duration `mapstructure:"max_lifetime"`
	MaxIdleTime    time.Duration `mapstructure:"max_idle_time"`
}

func Load() (*Config, error) {
	viper.SetConfigName("config")
	viper.SetConfigType("yaml")
	viper.AddConfigPath(".")
	viper.AddConfigPath("/etc/iotstudio/")
	viper.AddConfigPath("$HOME/.iotstudio/")

	viper.SetDefault("server.addr", ":8080")
	viper.SetDefault("server.read_timeout", 10*time.Second)
	viper.SetDefault("server.write_timeout", 10*time.Second)
	viper.SetDefault("server.idle_timeout", 60*time.Second)

	viper.SetDefault("database.path", "./data/iotstudio.db")

	viper.SetDefault("pool.max_connections", 100)
	viper.SetDefault("pool.max_pool_size", 10)
	viper.SetDefault("pool.max_lifetime", 5*time.Minute)
	viper.SetDefault("pool.max_idle_time", 1*time.Minute)

	viper.AutomaticEnv()
	viper.BindEnv("database.path", "DB_PATH")
	viper.BindEnv("server.addr", "SERVER_ADDR")

	if err := viper.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return nil, err
		}
	}

	var cfg Config
	if err := viper.Unmarshal(&cfg); err != nil {
		return nil, err
	}

	return &cfg, nil
}
