package store

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"time"

	bbolt "go.etcd.io/bbolt"
)

var (
	bucketUsers    = []byte("users")
	bucketSessions = []byte("sessions")
	bucketAudit    = []byte("audit")
)

type Store struct{ db *bbolt.DB }

func Open(path string) (*Store, error) {
	if path == "" { return nil, errors.New("store path is required") }
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil { return nil, fmt.Errorf("create store directory: %w", err) }
	db, err := bbolt.Open(path, 0600, &bbolt.Options{Timeout: 2 * time.Second, NoSync: false})
	if err != nil { return nil, fmt.Errorf("open store: %w", err) }
	s := &Store{db: db}
	if err := db.Update(func(tx *bbolt.Tx) error {
		for _, name := range [][]byte{bucketUsers,bucketSessions,bucketAudit} {
			if _, err := tx.CreateBucketIfNotExists(name); err != nil { return err }
		}
		return nil
	}); err != nil { _ = db.Close(); return nil, fmt.Errorf("initialize store: %w", err) }
	return s, nil
}

func (s *Store) Close() error { if s == nil || s.db == nil { return nil }; return s.db.Close() }

func putJSON(tx *bbolt.Tx, bucket, key []byte, value any) error {
	b := tx.Bucket(bucket); if b == nil { return errors.New("bucket unavailable") }
	data, err := json.Marshal(value); if err != nil { return err }
	return b.Put(key, data)
}

func getJSON(tx *bbolt.Tx, bucket, key []byte, out any) error {
	b := tx.Bucket(bucket); if b == nil { return errors.New("bucket unavailable") }
	data := b.Get(key); if data == nil { return bbolt.ErrBucketNotFound }
	return json.Unmarshal(data, out)
}

func (s *Store) PutUser(user User) error {
	if user.ID == "" { return errors.New("user id is required") }
	return s.db.Update(func(tx *bbolt.Tx) error { return putJSON(tx,bucketUsers,[]byte(user.ID),user) })
}

func (s *Store) GetUser(id string) (*User,error) {
	var u User
	err:=s.db.View(func(tx *bbolt.Tx) error{return getJSON(tx,bucketUsers,[]byte(id),&u)})
	if err!=nil{return nil,err}; return &u,nil
}

func (s *Store) DeleteUser(id string) error { return s.db.Update(func(tx *bbolt.Tx) error{return tx.Bucket(bucketUsers).Delete([]byte(id))}) }

func (s *Store) ListUsers() ([]User,error) {
	out:=make([]User,0)
	err:=s.db.View(func(tx *bbolt.Tx) error{return tx.Bucket(bucketUsers).ForEach(func(_,v []byte) error{if v==nil{return nil};var u User;if err:=json.Unmarshal(v,&u);err!=nil{return err};out=append(out,u);return nil})})
	return out,err
}

func (s *Store) PutSession(session Session) error {
	if session.ID=="" {return errors.New("session id is required")}
	return s.db.Update(func(tx *bbolt.Tx) error{return putJSON(tx,bucketSessions,[]byte(session.ID),session)})
}

func (s *Store) GetSession(id string)(*Session,error){var v Session;err:=s.db.View(func(tx *bbolt.Tx)error{return getJSON(tx,bucketSessions,[]byte(id),&v)});if err!=nil{return nil,err};return &v,nil}

func (s *Store) DeleteSession(id string) error{return s.db.Update(func(tx *bbolt.Tx)error{return tx.Bucket(bucketSessions).Delete([]byte(id))})}

func (s *Store) PutAudit(event AuditEvent) error {
	if event.ID=="" {return errors.New("audit id is required")}
	return s.db.Update(func(tx *bbolt.Tx) error{return putJSON(tx,bucketAudit,[]byte(event.ID),event)})
}

func (s *Store) ListAudit(limit int)([]AuditEvent,error){
	if limit<=0 {limit=100};out:=make([]AuditEvent,0,limit)
	err:=s.db.View(func(tx *bbolt.Tx)error{
		c:=tx.Bucket(bucketAudit).Cursor()
		for k,v:=c.Last();k!=nil&&len(out)<limit;k,v=c.Prev(){if v==nil{continue};var e AuditEvent;if err:=json.Unmarshal(v,&e);err!=nil{return err};out=append(out,e)}
		return nil
	});return out,err
}
